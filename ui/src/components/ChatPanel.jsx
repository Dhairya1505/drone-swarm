import { useState, useRef, useEffect } from 'react';
import { Send, Bot } from 'lucide-react';
import { sendChat } from '../api';

export default function ChatPanel({ missionId }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hello! I\'m your drone swarm AI analyst. Ask me anything about the mission — zone partitioning, squad assignments, trust scores, or disaster response strategy.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('qwen2.5:3b');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const { reply } = await sendChat({ mission_id: missionId, message: text, model });
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="panel right" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-section" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Bot size={16} color="var(--accent-light)" />
        <span className="panel-title" style={{ margin: 0 }}>AI Mission Analyst</span>
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          style={{
            marginLeft: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-secondary)', padding: '2px 6px', fontSize: '0.72rem', fontFamily: 'inherit',
          }}
        >
          <option value="llama3">llama3</option>
          <option value="llama3.2">llama3.2</option>
          <option value="mistral">mistral</option>
          <option value="gemma3">gemma3</option>
          <option value="qwen2.5">qwen2.5</option>
        </select>
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble fade-in ${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble thinking fade-in">
            <span className="spinner" style={{ display: 'inline-block' }} /> Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the mission… (Enter to send)"
          rows={2}
        />
        <button className="btn btn-primary" style={{ width: 40, padding: 0 }} onClick={submit} disabled={loading}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
