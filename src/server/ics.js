// RFC 5545 TEXT values must not introduce physical content lines.
function escapeIcs(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

module.exports = { escapeIcs };
