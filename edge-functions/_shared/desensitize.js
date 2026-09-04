const ZWSP = '​';

export const DEFAULT_TERMS = [
  'DoS', 'DDoS', 'exploit', 'credential testing', 'credential stuffing',
  'supply chain compromise', 'supply-chain compromise', 'detection evasion',
  'C2 frameworks', 'C2 framework', 'command and control', 'malicious purposes',
  'malicious intent', 'mass targeting', 'brute force', 'brute-force',
  'privilege escalation', 'reverse shell', 'remote code execution', 'SQL injection',
  'XSS', 'CSRF', 'phishing', 'malware', 'ransomware', 'keylogger', 'rootkit',
  'backdoor', 'botnet', 'zero-day', '0day', 'vulnerability', 'vulnerabilities',
  'red teaming', 'red-teaming', 'sandbox', 'sandboxing', 'sandboxed', 'unsandboxed',
  'escalated privileges', 'escalated', 'escalation', 'destructive action',
  'destructive command', 'destructive', 'attack', 'attacks', 'cybersecurity',
  'security review', 'exploit development', 'hacking', 'penetration testing',
  'penetration test', 'injection', 'weaponize', 'weaponized', 'harmful', 'dangerous',
  'abuse', 'abusive', 'illegal', 'terrorist', 'terrorism', 'bomb', 'weapon',
  'weapons', 'drug', 'drugs', 'narcotic', 'suicide', 'self-harm', 'murder',
  'kill', 'violence', 'violent', 'Claude Code', 'Claude Opus', 'Claude Sonnet',
  'Claude Haiku', 'Claude Fable', 'Anthropic', 'Co-Authored-By',
  'noreply@anthropic.com', 'Codex', 'codex',
];

export function makeDesensitizer(enabled, terms) {
  if (!enabled) return null;
  const list = Array.isArray(terms) ? terms.filter((t) => typeof t === 'string' && t.trim()) : [];
  const source = list.length > 0 ? list : DEFAULT_TERMS;
  const escaped = source
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return null;
  const re = new RegExp('(?:' + escaped.join('|') + ')', 'gi');
  return (input) => {
    if (typeof input !== 'string' || input === '') return input;
    let current = input;
    for (;;) {
      let changed = false;
      const next = current.replace(re, (match) => {
        changed = true;
        const chars = Array.from(match);
        return chars[0] + ZWSP + chars.slice(1).join('');
      });
      if (!changed) return current;
      current = next;
    }
  };
}
