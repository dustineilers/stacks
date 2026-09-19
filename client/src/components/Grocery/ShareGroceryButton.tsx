import { useEffect, useRef, useState } from 'react';
import { formatGroceryListAsText } from '../../utils/groceryShare';
import type { GroceryItem } from '../../types';

interface ShareGroceryButtonProps {
  items: GroceryItem[];
}

export function ShareGroceryButton({ items }: ShareGroceryButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function';

  const text = formatGroceryListAsText(items);

  // Close menu when clicking outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const shareNative = async () => {
    try {
      await navigator.share({
        title: 'Grocery List',
        text,
      });

      setOpen(false);
    } catch (error) {
      // User closing the native share sheet is not an error.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error('Unable to share grocery list:', error);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(text);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1200);
    } catch (error) {
      console.error('Unable to copy grocery list:', error);

      // Fallback for browsers where clipboard API isn't available
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      try {
        document.execCommand('copy');
        setCopied(true);

        setTimeout(() => {
          setCopied(false);
          setOpen(false);
        }, 1200);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const downloadText = () => {
    const blob = new Blob([text], {
      type: 'text/plain;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'grocery-list.txt';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const emailLink =
    `mailto:?subject=${encodeURIComponent('Grocery List')}` +
    `&body=${encodeURIComponent(text)}`;

  if (items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'relative',
      }}
    >
      <button
        type="button"
        className="btn small"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Share
        <span style={{ marginLeft: 5 }}>⌄</span>
      </button>

      {open && (
        <div
          role="menu"
          className="fp-sec"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 30,
            width: 230,
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: 8,
            boxShadow: '0 18px 36px -14px var(--shadow)',
          }}
        >
          {canShare && (
            <button
              type="button"
              className="btn small"
              onClick={shareNative}
              style={{
                width: '100%',
                textAlign: 'left',
                marginBottom: 6,
              }}
            >
              📱 Share…
            </button>
          )}

          <button
            type="button"
            className="btn small"
            onClick={copyToClipboard}
            style={{
              width: '100%',
              textAlign: 'left',
              marginBottom: 6,
            }}
          >
            {copied ? '✓ Copied!' : '📋 Copy list'}
          </button>

          <a
            className="btn small"
            href={emailLink}
            style={{
              display: 'block',
              width: '100%',
              boxSizing: 'border-box',
              textAlign: 'left',
              textDecoration: 'none',
              marginBottom: 6,
            }}
            onClick={() => setOpen(false)}
          >
            ✉️ Email list
          </a>

          <button
            type="button"
            className="btn small"
            onClick={downloadText}
            style={{
              width: '100%',
              textAlign: 'left',
              marginBottom: 6,
            }}
          >
            📄 Download .txt
          </button>

          <button
            type="button"
            className="btn small"
            onClick={() => setOpen(false)}
            style={{
              width: '100%',
              textAlign: 'left',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
