import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import './Viewer.css';
import { db } from '../firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { toggleTheme, isDarkMode } from '../theme';

// Add marked extension and patch link renderer at the top-level
marked.use({
  extensions: [
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

const Viewer = () => {
  const { url } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [themeVersion, setThemeVersion] = useState(0);
  const [editCodeInput, setEditCodeInput] = useState('');
  const [showEditPrompt, setShowEditPrompt] = useState(false);
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [editCodeError, setEditCodeError] = useState('');
  const [noteEditCode, setNoteEditCode] = useState('');
  const [showEditCodeOnce, setShowEditCodeOnce] = useState(null);

  useEffect(() => {
    if (!url) return;
    const editCodeKey = `showEditCodeFor_${url}`;
    const storedEditCode = localStorage.getItem(editCodeKey);
    if (storedEditCode) {
      setShowEditCodeOnce(storedEditCode);
      localStorage.removeItem(editCodeKey);
    }
  }, [url]);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const docRef = doc(db, 'notes', url);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          throw new Error('Note not found');
        }
        setContent(docSnap.data().content);
        setNoteEditCode(docSnap.data().editCode || '');
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };
    fetchContent();
  }, [url]);

  // Notu siler ve ana sayfaya yönlendirir
  const handleDelete = async () => {
    setShowDeletePrompt(true);
  };

  const confirmDelete = async (e) => {
    e.preventDefault();
    if (editCodeInput !== noteEditCode) {
      setEditCodeError('Invalid edit code.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'notes', url));
      navigate('/');
    } catch (err) {
      alert('Failed to delete note.');
    }
  };

  // Editöre yönlendirir
  const handleEdit = () => {
    setShowEditPrompt(true);
  };

  const confirmEdit = (e) => {
    e.preventDefault();
    if (editCodeInput !== noteEditCode) {
      setEditCodeError('Invalid edit code.');
      return;
    }
    navigate(`/edit/${url}`);
  };

  // Kopyalama fonksiyonu
  const handleCopy = () => {
    const link = window.location.origin + '/' + url;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Theme toggle handler
  const handleThemeToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleTheme();
    setThemeVersion(v => v + 1); // force re-render for theme
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  // Render markdown and preserve blank lines
  const renderedHtml = marked(content).replace(/(<\/p>)(\s*<p>)/g, '$1<br>$2').replace(/\n{2,}/g, '<br><br>');

  return (
    <div
      className="viewer-container"
      key={themeVersion}
      style={{ background: 'var(--bg-color)', color: 'var(--text-color)', minHeight: '100vh', transition: 'background 0.3s, color 0.3s' }}
    >
      {showEditCodeOnce && (
        <div style={{ margin: '0.5rem auto', maxWidth: 320, background: '#f6fff6', border: '1px solid #b2e6b2', borderRadius: 6, padding: '0.4rem 0.7rem', color: 'green', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '1em', position: 'relative' }}>
          <span style={{ fontSize: '1em', fontWeight: 500 }}>● Your edit code:</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '1.05em', background: '#fff', padding: '0.05em 0.3em', borderRadius: 3 }}>{showEditCodeOnce}</span>
          <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} onClick={() => {navigator.clipboard.writeText(showEditCodeOnce)}} title="Copy">
            <i className="fa fa-clipboard" style={{ color: 'green', fontSize: '1em' }}></i>
          </button>
        </div>
      )}
      <div
        className="content"
        style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 24 }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
      <div style={{ marginTop: '1.5rem', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '8px' }}>
        <button
          type="button"
          className="edit-btn"
          onClick={handleEdit}
          style={{ marginRight: '-0.2rem' }}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={handleDelete}
        >
          Delete
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate('/')}
        >
          New Note
        </button>
        {showEditPrompt && (
          <div className="modal-backdrop">
            <div className="modal">
              <form onSubmit={confirmEdit} className="edit-code-form">
                <input
                  type="text"
                  value={editCodeInput}
                  onChange={e => setEditCodeInput(e.target.value)}
                  placeholder="Enter edit code"
                  className="form-control"
                  style={{ marginBottom: '0.5rem' }}
                />
                <button type="submit" className="btn btn-primary" style={{ marginRight: '0.5rem' }}>Submit</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditPrompt(false); setEditCodeInput(''); setEditCodeError(''); }}>Cancel</button>
                {editCodeError && <div className="error">{editCodeError}</div>}
              </form>
            </div>
          </div>
        )}
        {showDeletePrompt && (
          <div className="modal-backdrop">
            <div className="modal">
              <form onSubmit={confirmDelete} className="edit-code-form">
                <input
                  type="text"
                  value={editCodeInput}
                  onChange={e => setEditCodeInput(e.target.value)}
                  placeholder="Enter edit code to delete"
                  className="form-control"
                  style={{ marginBottom: '0.5rem' }}
                />
                <button type="submit" className="btn btn-danger" style={{ marginRight: '0.5rem' }}>Delete</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowDeletePrompt(false); setEditCodeInput(''); setEditCodeError(''); }}>Cancel</button>
                {editCodeError && <div className="error">{editCodeError}</div>}
              </form>
            </div>
          </div>
        )}
        <button
          type="button"
          className="copy-btn"
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <button
          className="theme-toggle"
          onClick={handleThemeToggle}
          title="Toggle dark/light mode"
          style={{ marginLeft: 'auto' }}
        >
          {isDarkMode() ? <i class="fa-solid fa-moon"></i> : <i className="fa-solid fa-sun"></i>}
        </button>
      </div>
    </div>
  );
};

export default Viewer; 