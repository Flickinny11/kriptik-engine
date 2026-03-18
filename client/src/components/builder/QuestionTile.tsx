import { useState, useEffect, useCallback } from 'react';
import { Link2, Check, ExternalLink } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface OAuthCatalogEntry {
  id: string;
  displayName: string;
  category: string;
  authType: string;
}

interface QuestionTileProps {
  nodeId: string;
  question: string;
  context?: string;
  projectId: string;
  oauthCatalog: OAuthCatalogEntry[];
  onAnswer: (nodeId: string, answer: string) => void;
}

/**
 * Renders an agent's question as an interactive tile.
 *
 * The agent writes the question in natural language — this component:
 * 1. Shows the question text as-is
 * 2. Tries to parse numbered options from the text (soft heuristic)
 * 3. For each option, checks if the service name matches an OAuth provider
 * 4. If yes, shows a Connect button that triggers the OAuth popup
 * 5. If parsing fails, falls back to a plain text input
 *
 * The agent has NO knowledge of this component. It just writes naturally.
 * The UI enriches the display — that's the only mechanical part.
 */
export function QuestionTile({ nodeId, question, context, projectId, oauthCatalog, onAnswer }: QuestionTileProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(new Set());
  const [textAnswer, setTextAnswer] = useState('');
  const [answered, setAnswered] = useState(false);

  // Try to parse numbered options from the agent's natural language
  const parsed = parseOptions(question);

  // Listen for OAuth popup completion
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'oauth_complete' && event.data.success) {
        setConnectedProviders(prev => new Set([...prev, event.data.provider]));
        // Auto-select and answer with the connected provider
        const providerName = oauthCatalog.find(p => p.id === event.data.provider)?.displayName || event.data.provider;
        setSelectedOption(providerName);
        handleAnswer(providerName);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [nodeId, oauthCatalog]);

  const handleAnswer = useCallback((answer: string) => {
    if (answered) return;
    setAnswered(true);
    onAnswer(nodeId, answer);
  }, [nodeId, onAnswer, answered]);

  const handleConnect = async (providerId: string) => {
    try {
      const { authorizationUrl } = await apiClient.startOAuth(providerId, projectId);
      // Open OAuth popup
      const width = 600, height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(authorizationUrl, `oauth_${providerId}`, `width=${width},height=${height},left=${left},top=${top}`);
    } catch (err) {
      console.error('Failed to start OAuth:', err);
    }
  };

  if (answered) {
    return (
      <div className="border border-green-500/20 rounded-lg p-4 bg-green-500/5">
        <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
          <Check size={16} />
          Answered: {selectedOption || textAnswer}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-kriptik-amber/20 rounded-lg p-4 bg-kriptik-amber/5">
      {/* Agent's question */}
      <div className="text-sm text-kriptik-white mb-1 font-medium">
        {parsed.questionText}
      </div>
      {context && (
        <div className="text-xs text-kriptik-silver mb-3">{context}</div>
      )}

      {parsed.options.length > 0 ? (
        /* Render parsed options as selectable cards */
        <div className="space-y-2 mt-3">
          {parsed.options.map((opt, i) => {
            const matchedProvider = findMatchingProvider(opt.name, oauthCatalog);
            const isConnected = matchedProvider ? connectedProviders.has(matchedProvider.id) : false;

            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedOption === opt.name
                    ? 'border-kriptik-lime/50 bg-kriptik-lime/5'
                    : 'border-white/5 bg-kriptik-charcoal hover:border-white/10'
                }`}
                onClick={() => {
                  setSelectedOption(opt.name);
                  // Don't auto-submit — let user connect or confirm
                }}
              >
                <div className="flex-1">
                  <span className="text-sm text-kriptik-white font-medium">{opt.name}</span>
                  {opt.description && (
                    <span className="text-xs text-kriptik-silver ml-2">{opt.description}</span>
                  )}
                </div>

                {/* Connect button if OAuth exists for this provider */}
                {matchedProvider && !isConnected && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleConnect(matchedProvider.id); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-kriptik-lime/10 text-kriptik-lime text-xs font-medium rounded-md hover:bg-kriptik-lime/20 transition-colors"
                  >
                    <Link2 size={12} />
                    Connect
                  </button>
                )}

                {/* Connected indicator */}
                {isConnected && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-green-400 text-xs font-medium">
                    <Check size={12} />
                    Connected
                  </span>
                )}
              </div>
            );
          })}

          {/* Submit button */}
          {selectedOption && (
            <button
              onClick={() => handleAnswer(selectedOption)}
              className="w-full mt-2 py-2 bg-kriptik-lime text-kriptik-black text-sm font-semibold rounded-lg hover:bg-kriptik-lime/90 transition-colors"
            >
              Confirm: {selectedOption}
            </button>
          )}
        </div>
      ) : (
        /* Fallback: plain text input when options can't be parsed */
        <div className="flex gap-2 mt-3">
          <input
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && textAnswer.trim() && handleAnswer(textAnswer)}
            placeholder="Type your answer..."
            className="flex-1 bg-kriptik-charcoal border border-white/10 rounded-lg px-3 py-2 text-sm text-kriptik-white focus:outline-none focus:border-kriptik-lime/30"
          />
          <button
            onClick={() => textAnswer.trim() && handleAnswer(textAnswer)}
            disabled={!textAnswer.trim()}
            className="px-4 py-2 bg-kriptik-lime text-kriptik-black text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Soft heuristic to parse numbered options from agent's natural language.
 * Looks for patterns like "1. **Name** — description" or "1. Name - description"
 * If it can't find options, returns empty array and falls back to text input.
 */
function parseOptions(text: string): { questionText: string; options: { name: string; description: string }[] } {
  const lines = text.split('\n');
  const options: { name: string; description: string }[] = [];
  const questionLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match: "1. **Name** — description" or "1. Name - description" or "- **Name**: description"
    const match = trimmed.match(/^(?:\d+\.\s*|\-\s*)(?:\*\*(.+?)\*\*|([A-Z][A-Za-z0-9\s.]+?))\s*(?:—|–|-|:|:)\s*(.+)$/);
    if (match) {
      options.push({
        name: (match[1] || match[2]).trim(),
        description: match[3].trim(),
      });
    } else if (options.length === 0) {
      // Lines before options start are the question text
      questionLines.push(trimmed);
    }
  }

  return {
    questionText: questionLines.join(' ').trim() || text.split('\n')[0],
    options,
  };
}

/**
 * Fuzzy match a service name from the agent's text against the OAuth catalog.
 * Case-insensitive, matches on display name or ID.
 */
function findMatchingProvider(name: string, catalog: OAuthCatalogEntry[]): OAuthCatalogEntry | null {
  const lower = name.toLowerCase().trim();
  return catalog.find(p =>
    (p.authType === 'oauth2' || p.authType === 'oauth2-pkce') &&
    (p.id === lower || p.displayName.toLowerCase() === lower || p.id === lower.replace(/\s+/g, '-'))
  ) || null;
}
