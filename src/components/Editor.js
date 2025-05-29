import React, { useState, useEffect, useCallback } from 'react';
import { marked } from 'marked';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import './Editor.css';
import { db } from '../firebase';
import { serverTimestamp, doc, getDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import { toggleTheme, isDarkMode } from '../theme';

// Short ID generator
function generateShortId(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Edit code generator
function generateEditCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Colored text: %red% ... %% or %#HEX% ... %%
marked.use({
  extensions: [
    {
      name: 'coloredText',
      level: 'inline',
      start(src) { return src.match(/%[a-zA-Z#0-9]+%/)?.index; },
      tokenizer(src) {
        const match = src.match(/^%([a-zA-Z#0-9]+)%([\s\S]+?)%%/);
        if (match) {
          return {
            type: 'coloredText',
            raw: match[0],
            color: match[1],
            text: match[2],
          };
        }
      },
      renderer(token) {
        return `<span style="color:${token.color.startsWith('#') ? token.color : token.color};">${token.text}</span>`;
      }
    },
    // Underline: !~ ... ~!
    {
      name: 'underline',
      level: 'inline',
      start(src) { return src.match(/!~[a-zA-Z#0-9; ]*;/)?.index; },
      tokenizer(src) {
        const match = src.match(/^!~([^;]+;[^;]*;?[^;]*;?[^;]*;?) ([\s\S]+?) ~!/);
        if (match) {
          // Parse options: color;style;type;thickness
          const [color, style, type, thickness] = match[1].split(';').map(s => s.trim());
          return {
            type: 'underline',
            raw: match[0],
            color,
            style,
            decoType: type,
            thickness,
            text: match[2],
          };
        }
      },
      renderer(token) {
        let style = 'text-decoration-line:underline;';
        if (token.color) style += `text-decoration-color:${token.color};`;
        if (token.style) style += `text-decoration-style:${token.style};`;
        if (token.decoType) style += `text-decoration-line:${token.decoType};`;
        if (token.thickness) style += `text-decoration-thickness:${token.thickness}px;`;
        return `<span style="${style}">${token.text}</span>`;
      }
    },
    // Spoiler: !> ... (block, multi-line)
    {
      name: 'spoiler',
      level: 'block',
      start(src) { return src.match(/^!>/)?.index; },
      tokenizer(src) {
        const match = src.match(/^!>([\s\S]+?)(?=\n{2,}|$)/);
        if (match) {
          return {
            type: 'spoiler',
            raw: match[0],
            text: match[1].trim(),
          };
        }
      },
      renderer(token) {
        return `<div class="spoiler">${marked.parse(token.text)}</div>`;
      }
    },
    // Admonition: !!! info\n...
    {
      name: 'admonition',
      level: 'block',
      start(src) { return src.match(/^!!! /)?.index; },
      tokenizer(src) {
        const match = src.match(/^!!! (info|note|warning|danger|greentext)?\n([\s\S]+?)(?=\n{2,}|$)/);
        if (match) {
          return {
            type: 'admonition',
            raw: match[0],
            kind: match[1] || 'warning',
            text: match[2],
          };
        }
      },
      renderer(token) {
        return `<div class="admonition ${token.kind}"><strong>${token.kind.toUpperCase()}</strong><div>${marked.parse(token.text)}</div></div>`;
      }
    },
    // Checkbox: - [ ] or - [x]
    {
      name: 'checkbox',
      level: 'block',
      start(src) { return src.match(/^- \[.?\]/)?.index; },
      tokenizer(src) {
        const match = src.match(/^- \[( |x)\] (.+)$/m);
        if (match) {
          return {
            type: 'checkbox',
            raw: match[0],
            checked: match[1] === 'x',
            text: match[2],
          };
        }
      },
      renderer(token) {
        return `<div class="checkbox-item"><input type="checkbox" disabled ${token.checked ? 'checked' : ''}/> ${token.text}</div>`;
      }
    },
    {
      name: 'autolink',
      level: 'inline',
      start(src) { return src.match(/(?:https?:\/\/|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})(\S*)?/i)?.index; },
      tokenizer(src) {
        const match = src.match(/^(https?:\/\/|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})(\S*)?/i);
        if (match) {
          let url = match[0];
          if (!url.startsWith('http')) url = 'https://' + url;
          return {
            type: 'autolink',
            raw: match[0],
            href: url,
            text: match[0],
          };
        }
      },
      renderer(token) {
        return `<a href="${token.href}" target="_blank" rel="noopener noreferrer">${token.text}</a>`;
      }
    }
  ],
  renderer: {
    link(href, title, text) {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`;
    }
  }
});

const Editor = () => {
  const { url: noteId } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [activeTab, setActiveTab] = useState('text');
  const [mode, setMode] = useState('edit');
  const [loading, setLoading] = useState(!!noteId);
  const [editCode, setEditCode] = useState('');
  const [editCodeInput, setEditCodeInput] = useState('');
  const [editError, setEditError] = useState('');
  const [showEditInput, setShowEditInput] = useState(false);
  const [themeVersion, setThemeVersion] = useState(0);

  // Handle theme toggle without React state
  const handleThemeToggle = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleTheme();
    setThemeVersion(v => v + 1);
  }, []);

  // Fetch note if editing/viewing existing note
  useEffect(() => {
    if (noteId) {
      setLoading(true);
      getDoc(doc(db, 'notes', noteId)).then(docSnap => {
        if (docSnap.exists()) {
          setContent(docSnap.data().content);
          setEditCode(docSnap.data().editCode || '');
          // Check localStorage for edit code
          const storedCode = localStorage.getItem(`editCode_${noteId}`);
          if (storedCode && storedCode === docSnap.data().editCode) {
            setMode('edit');
          } else {
            setMode('view');
          }
        }
        setLoading(false);
      });
    }
  }, [noteId]);

  const handleContentChange = (value) => {
    setContent(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let code = editCode;
      if (!noteId) {
        // Generate random edit code instead of using user input
        code = generateEditCode();
        setEditCode(code);
        // Generate unique shortId
        let shortId;
        let exists = true;
        while (exists) {
          shortId = generateShortId();
          const docSnap = await getDoc(doc(db, 'notes', shortId));
          exists = docSnap.exists();
        }
        await setDoc(doc(db, 'notes', shortId), {
          content,
          createdAt: serverTimestamp(),
          editCode: code,
        });
        localStorage.setItem(`editCode_${shortId}`, code);
        localStorage.setItem(`showEditCodeFor_${shortId}`, code);
        setContent('');
        navigate(`/${shortId}`);
      } else {
        // Editing existing note
        const docRef = doc(db, 'notes', noteId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
          alert('Note not found. It may have been deleted.');
          navigate('/');
          return;
        }

        await updateDoc(docRef, {
          content,
          updatedAt: serverTimestamp(),
        });
        
        alert('Note updated successfully!');
        navigate(`/${noteId}`);
      }
    } catch (err) {
      console.error('Error saving note:', err);
      alert(`Failed to save note: ${err.message}`);
    }
  };

  const handleEditCodeSubmit = (e) => {
    e.preventDefault();
    if (editCodeInput === editCode) {
      localStorage.setItem(`editCode_${noteId}`, editCodeInput);
      setMode('edit');
      setEditError('');
    } else {
      setEditError('Invalid edit code.');
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'notes', noteId));
        localStorage.removeItem(`editCode_${noteId}`);
        navigate('/');
      } catch (err) {
        alert('Failed to delete note.');
      }
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="editor-container" style={{ position: 'relative' }}>
      {mode === 'edit' ? (
        <form onSubmit={handleSubmit}>
          <div className="editor-tabs">
            <button
              type="button"
              className={activeTab === 'text' ? 'active' : ''}
              onClick={() => setActiveTab('text')}
            >
              Text
            </button>
            <button
              type="button"
              className={activeTab === 'preview' ? 'active' : ''}
              onClick={() => setActiveTab('preview')}
            >
              Preview
            </button>
            <button
              type="button"
              className={activeTab === 'how' ? 'active' : ''}
              onClick={() => setActiveTab('how')}
            >
              How
            </button>
          </div>

          <div className="editor-content">
            {activeTab === 'text' && mode === 'edit' && (
              <CodeMirror
                key={themeVersion}
                value={content}
                height="60vh"
                theme={isDarkMode() ? oneDark : 'light'}
                extensions={[markdown()]}
                onChange={handleContentChange}
                basicSetup={{ lineNumbers: true }}
                style={{ fontSize: '1rem', background: isDarkMode() ? '#232323' : '#fff' }}
                placeholder={
                  'Type your note here. You can use Markdown formatting.\n\nExample:\n# Title\n**bold**\n*italic*\n- List item\n[Link](https://example.com)'
                }
              />
            )}
            {activeTab === 'preview' && (
              <div
                className="preview"
                dangerouslySetInnerHTML={{ __html: marked(content).replace(/(<\/p>)(\s*<p>)/g, '$1<br>$2').replace(/\n{2,}/g, '<br><br>') }}
              />
            )}
            {activeTab === 'how' && (
              <div className="how-content">
                {/* BEGIN: Rentry.co How Table */}
                <table className="ntable mtable cheatsheet">
                  <thead>
                    <tr className="text-center">
                      <th className="bg-transparent">What you type</th>
                      <th className="bg-transparent">What will be published</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        # Header 1<br />
                        ## Header 2<br /><br />
                        <span className="text-muted">And so on up to 6.</span>
                      </td>
                      <td>
                        <p id="header-1" className="p-0 m-0 text-center h3">Header 1</p>
                        <p id="header-2" className="p-2 pt-3 m-0 h4">Header 2</p>
                        <p id="another-2" className="d-none">Another 2</p>
                        <p id="another-1" className="d-none">Another 1</p>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="text-muted">Return once starts a new line.<br />Return twice (blank line) starts a new paragraph.</span><br />
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td>
                        *Italics*<br />
                        **Bold**<br />
                        ~~Strikeout~~<br />
                        ==Mark==<br />
                        %red% Colored Text %%<br />
                        %#ACBDEF% Colored Text Hex %%<br />
                        !&gt;Spoiler<br /><br />
                        <span className="text-muted"><a href="/rentry-text-colors" target="_blank">Color list (opens new page, save your work first!)</a></span>
                      </td>
                      <td>
                        <i>Italics</i><br />
                        <b>Bold</b><br />
                        <del>Strikeout</del><br />
                        <mark>Mark</mark><br />
                        <span style={{ color: 'red' }}>Colored Text</span><br />
                        <span style={{ color: '#8b35c8' }}>Colored Text Hex</span><br />
                        <span className="spoiler">Spoiler</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        !~ Simple Underlined Text ~!<br />
                        !~red; Underlined Text With Color ~!<br />
                        !~green;double; Underlined Text Plus Style ~!<br />
                        !~blue;default;line-through; Underlined Plus Type ~!<br />
                        !~orange;default;default;7; Underlined Text Plus Thickness ~!<br /><br />
                        %violet% !~green; Combine With Text Color ~! %%<br />
                        !~violet; %green% Works The Other Way Too %% ~! <br /><br />
                        <span className="text-muted">Underline tags can be given 4 options, separated by a semi-colon ;</span>
                        <ul className="text-muted">
                          <li>color : default | color name | #hexcode</li>
                          <li>style  : default | solid (default) | double | dotted | dashed | wavy</li>
                          <li>type  : default | underline (default) | line-through | overline | both</li>
                          <li>thickness : number from 1-10. Measured in pixels.</li>
                        </ul>
                      </td>
                      <td>
                        <span style={{ textDecoration: 'underline' }}>Simple Underlined Text</span><br />
                        <span style={{ textDecorationLine: 'underline', textDecorationColor: 'red' }}>Underlined Text With Color</span><br />
                        <span style={{ textDecorationLine: 'underline', textDecorationColor: 'green', textDecorationStyle: 'double' }}>Underlined Text Plus Style</span><br />
                        <span style={{ textDecorationLine: 'line-through', textDecorationColor: 'blue' }}>Underlined Plus Type</span><br />
                        <span style={{ textDecorationLine: 'underline', textDecorationColor: 'orange', textDecorationThickness: '7px' }}>Underlined Text Plus Thickness</span><br /><br />
                        <span style={{ textDecorationLine: 'underline', textDecorationColor: 'green', color: 'violet' }}>Combine With Text Color</span><br />
                        <span style={{ textDecorationLine: 'underline', textDecorationColor: 'violet', color: 'green' }}>Works The Other Way Too</span><br /><br />
                      </td>
                    </tr>
                    <tr>
                      <td>
                        -&gt; Centered text &lt;-<br />
                        -&gt; Right-aligned -&gt;<br /><br />
                        <span className="text-muted">Also works for images and ### -&gt; Headers &lt;-</span>
                        <br />
                      </td>
                      <td>
                        <span className="md-center">Centered text</span>
                        <span className="md-right">Right-aligned</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        [TOC]<br /><br />
                        <span className="text-muted">Generates Table of Contents from #&nbsp;Headers.<br />
                          [TOC2] - From h2 to h6.<br />
                          [TOC3] - From h3 to h6, and so on up to 6.
                        </span>
                      </td>
                      <td>
                        <div className="toc">
                          <ol>
                            <li><a href="#header-1">Header 1</a>
                              <ol>
                                <li><a href="#header-2">Header 2</a></li>
                                <li><a href="#another-2">Another 2</a></li>
                              </ol>
                            </li>
                            <li><a href="#another-1">Another 1</a></li>
                          </ol>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        - Bulleted list item a<br />
                        - Bulleted list item b<br />
                        &nbsp;&nbsp;&nbsp;&nbsp;- Nested item b1<br /><br />
                        <span className="text-muted">Nested lists use 4 spaces or 1 tab.</span><br /><br />
                        <span className="text-muted">An asterisk (*) can be used instead of a dash.</span>
                      </td>
                      <td>
                        <ul>
                          <li className="mt-0">Bulleted list item a</li>
                          <li>Bulleted list item b<ul>
                              <li>Nested item b1</li>
                            </ul>
                          </li>
                        </ul>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        1. Numbered list item<br />
                        2. Numbered list item<br />
                        &nbsp;&nbsp;&nbsp;&nbsp;1. Nested list item<br />
                        &nbsp;&nbsp;&nbsp;&nbsp;2. Nested list item
                      </td>
                      <td>
                        <ol>
                          <li className="mt-0">Numbered list item</li>
                          <li>Numbered list item<ol>
                              <li>Nested list item</li>
                              <li>Nested list item</li>
                            </ol>
                          </li>
                        </ol>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        - [ ] Checkbox 1<br />
                        - [x] Checkbox 2<br />
                      </td>
                      <td>
                        <ul className="task-list">
                          <li className="mt-0"><input type="checkbox" disabled /> Checkbox 1</li>
                          <li><input type="checkbox" disabled checked /> Checkbox 2</li>
                        </ul>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        [//]: (comment here)<br />
                      </td>
                      <td>
                        <p>Adding [//]: () to a line will comment it out, so that it does not appear when viewing the page.</p>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        &gt;&gt; How to use quotes in Markdown?<br />
                        &gt; Just prepend text with &gt;
                      </td>
                      <td>
                        <blockquote>
                          <blockquote>
                            <p>How to use quotes in Markdown?</p>
                          </blockquote>
                          <p>Just prepend text with &gt;</p>
                        </blockquote>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        ``` python<br />
                        s = "Triple backticks ( ``` ) generate code block"<br />
                        print(s)<br />
                        ```<br /><br />
                        <span className="text-muted">For the list of supported languages see <a href="/langs" aria-label="Supported languages list">the langs page</a>.</span>
                      </td>
                      <td>
                        <table className="highlighttable mt-0">
                          <tbody>
                            <tr>
                              <td className="linenos border-0 p-0">
                                <div className="linenodiv">
                                  <pre>
                                    <button type="button" className="line-number" aria-label="Line 1">1</button>
                                    <br />
                                    <button type="button" className="line-number" aria-label="Line 2">2</button>
                                  </pre>
                                </div>
                              </td>
                              <td className="code border-0 p-0">
                                <div className="highlight">
                                  <pre><span id="L-1-1"><span className="n">s</span> <span className="o">=</span><span className="s2">"Triple backticks ( ``` ) generate code block"</span></span><br /><span id="L-1-2"><span className="k">print</span><span className="p">(</span><span className="n">s</span><span className="p">)</span></span></pre>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        Single backtick generates <code>inline code</code>
                      </td>
                      <td>
                        Single backtick generates <code>inline code</code>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        ***<br /><br />
                        <span className="text-muted">Horizontal rule, &lt;hr&gt;</span>
                      </td>
                      <td>
                        <hr />
                      </td>
                    </tr>
                    <tr>
                      <td>
                        \*not italics\*<br /><br />
                        <span className="text-muted">To produce a literal asterisk or any symbol used in Markdown, use backslash to escape it.</span>
                      </td>
                      <td>
                        *not italics*
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <pre className="p-0 text-reset" style={{ lineHeight: '1.5', fontSize: '16px' }}>Header | Header{`\n`}------ | ------{`\n`}Cell   | Cell{`\n`}Cell   | Cell</pre>
                        <br /><span className="text-muted">Columns can be aligned to the right with <code>--:</code> and centered with <code>:--:</code>.</span><br /><br />
                        <pre className="p-0 text-reset" style={{ lineHeight: '1.5', fontSize: '16px' }}>Center | Right{`\n`}:----: | ----:{`\n`}Cell   | Cell{`\n`}Cell   | Cell</pre>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="editor-actions" style={{ display: 'flex', marginTop: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              {mode === 'edit' && (
                <>
                  <button type="submit" className="save-btn">Save</button>
                  {noteId && (
                    <button type="button" className="btn btn-danger" onClick={handleDelete}>Delete</button>
                  )}
                </>
              )}
              {mode === 'view' && (
                <button type="button" className="btn btn-primary" onClick={() => setShowEditInput(true)}>
                  Edit
                </button>
              )}
            </div>
            <button
              className="theme-toggle"
              onClick={handleThemeToggle}
              title="Toggle dark/light mode"
            >
              {isDarkMode() ? <i className="fa-solid fa-moon" style={{color: 'white'}}></i> : <i className="fa-solid fa-sun" style={{color: 'black'}}></i>}
            </button>
          </div>
        </form>
      ) : (
        <div className="view-mode">
          <div className="preview" dangerouslySetInnerHTML={{ __html: marked(content) }} />
          {showEditInput && (
            <form onSubmit={handleEditCodeSubmit} className="edit-code-form" style={{ margin: '1rem auto', maxWidth: 300 }}>
              <input
                type="text"
                value={editCodeInput}
                onChange={(e) => setEditCodeInput(e.target.value)}
                placeholder="Enter edit code"
                className="form-control"
                style={{ marginBottom: '0.5rem' }}
              />
              <button type="submit" className="btn btn-primary" style={{ marginRight: '0.5rem' }}>Submit</button>
              {editError && <div className="error">{editError}</div>}
            </form>
          )}
          <div className="view-actions" style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button type="button" className="btn btn-primary" style={{ marginRight: '0.5rem'}} onClick={() => setShowEditInput(true)}>
              Edit
            </button>
            {noteId && (
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;