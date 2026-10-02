const { endpointFor } = require('./providers');
function sharedKey(config, id, readSecret) {
  const find = key => key === 'assistant' ? config.assistant : config.employees?.find(e => e.id === key);
  const first = find(id), seen = new Set();
  if (!first) return '';
  let owner = id;
  while (owner && !seen.has(owner)) {
    seen.add(owner);
    const profile = find(owner);
    if (!profile || (profile.provider || 'demo') !== (first.provider || 'demo') || endpointFor(profile) !== endpointFor(first)) return '';
    const key = readSecret(owner, profile);
    if (key) return key;
    owner = profile.keyFrom;
  }
  return '';
}
module.exports = { sharedKey };
