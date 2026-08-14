/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) and strict JSON parser with duplicate-key rejection.
 */

/**
 * Strict JSON parser that throws if duplicate keys are present in any JSON object.
 */
export function parseStrictJSON<T = unknown>(jsonString: string): T {
  if (typeof jsonString !== 'string') {
    throw new Error('parseStrictJSON input must be a string');
  }

  // Parse using JSON.parse with a custom receiver or lexer check for duplicate keys
  // We can track object keys during token parsing
  let index = 0;

  function skipWhitespace() {
    while (index < jsonString.length) {
      const ch = jsonString[index];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        index++;
      } else {
        break;
      }
    }
  }

  function parseString(): string {
    if (jsonString[index] !== '"') {
      throw new Error(`Expected '"' at offset ${index}`);
    }
    index++; // skip open quote
    let result = '';
    while (index < jsonString.length) {
      const ch = jsonString[index];
      if (ch === '"') {
        index++; // skip close quote
        return result;
      }
      if (ch === '\\') {
        index++;
        if (index >= jsonString.length) throw new Error('Unterminated escape sequence in JSON string');
        const esc = jsonString[index];
        index++;
        if (esc === '"' || esc === '\\' || esc === '/') result += esc;
        else if (esc === 'b') result += '\b';
        else if (esc === 'f') result += '\f';
        else if (esc === 'n') result += '\n';
        else if (esc === 'r') result += '\r';
        else if (esc === 't') result += '\t';
        else if (esc === 'u') {
          const hex = jsonString.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error(`Invalid unicode escape at offset ${index}`);
          result += String.fromCharCode(parseInt(hex, 16));
          index += 4;
        } else {
          throw new Error(`Invalid escape sequence '\\${esc}' in JSON string`);
        }
      } else {
        // Control characters inside strings are forbidden in JSON
        if (ch.charCodeAt(0) < 0x20) {
          throw new Error(`Unescaped control character in JSON string at offset ${index}`);
        }
        result += ch;
        index++;
      }
    }
    throw new Error('Unterminated string in JSON');
  }

  function parseValue(): unknown {
    skipWhitespace();
    if (index >= jsonString.length) {
      throw new Error('Unexpected end of JSON input');
    }
    const ch = jsonString[index];

    if (ch === '{') return parseObject();
    if (ch === '[') return parseArray();
    if (ch === '"') return parseString();
    if (ch === 't' && jsonString.startsWith('true', index)) {
      index += 4;
      return true;
    }
    if (ch === 'f' && jsonString.startsWith('false', index)) {
      index += 5;
      return false;
    }
    if (ch === 'n' && jsonString.startsWith('null', index)) {
      index += 4;
      return null;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      return parseNumber();
    }

    throw new Error(`Unexpected token '${ch}' at offset ${index}`);
  }

  function parseNumber(): number {
    const start = index;
    if (jsonString[index] === '-') index++;
    while (index < jsonString.length && jsonString[index] >= '0' && jsonString[index] <= '9') {
      index++;
    }
    if (index < jsonString.length && jsonString[index] === '.') {
      index++;
      while (index < jsonString.length && jsonString[index] >= '0' && jsonString[index] <= '9') {
        index++;
      }
    }
    if (index < jsonString.length && (jsonString[index] === 'e' || jsonString[index] === 'E')) {
      index++;
      if (index < jsonString.length && (jsonString[index] === '+' || jsonString[index] === '-')) {
        index++;
      }
      while (index < jsonString.length && jsonString[index] >= '0' && jsonString[index] <= '9') {
        index++;
      }
    }
    const numStr = jsonString.slice(start, index);
    const num = Number(numStr);
    if (isNaN(num)) {
      throw new Error(`Invalid number '${numStr}' at offset ${start}`);
    }
    return num;
  }

  function parseArray(): unknown[] {
    index++; // skip '['
    skipWhitespace();
    const arr: unknown[] = [];
    if (index < jsonString.length && jsonString[index] === ']') {
      index++;
      return arr;
    }

    while (index < jsonString.length) {
      arr.push(parseValue());
      skipWhitespace();
      if (index >= jsonString.length) throw new Error('Unterminated array in JSON');
      if (jsonString[index] === ',') {
        index++;
        skipWhitespace();
      } else if (jsonString[index] === ']') {
        index++;
        return arr;
      } else {
        throw new Error(`Expected ',' or ']' at offset ${index}`);
      }
    }
    throw new Error('Unterminated array in JSON');
  }

  function parseObject(): Record<string, unknown> {
    index++; // skip '{'
    skipWhitespace();
    const obj: Record<string, unknown> = {};
    const seenKeys = new Set<string>();

    if (index < jsonString.length && jsonString[index] === '}') {
      index++;
      return obj;
    }

    while (index < jsonString.length) {
      skipWhitespace();
      if (jsonString[index] !== '"') {
        throw new Error(`Expected string key in object at offset ${index}`);
      }
      const key = parseString();
      if (seenKeys.has(key)) {
        throw new Error(`Strict JSON rejection: duplicate object key '${key}' detected`);
      }
      seenKeys.add(key);

      skipWhitespace();
      if (jsonString[index] !== ':') {
        throw new Error(`Expected ':' after key '${key}' at offset ${index}`);
      }
      index++; // skip ':'

      const val = parseValue();
      obj[key] = val;

      skipWhitespace();
      if (index >= jsonString.length) throw new Error('Unterminated object in JSON');
      if (jsonString[index] === ',') {
        index++;
        skipWhitespace();
      } else if (jsonString[index] === '}') {
        index++;
        return obj;
      } else {
        throw new Error(`Expected ',' or '}' at offset ${index}`);
      }
    }
    throw new Error('Unterminated object in JSON');
  }

  const result = parseValue() as T;
  skipWhitespace();
  if (index !== jsonString.length) {
    throw new Error(`Extraneous characters after JSON data at offset ${index}`);
  }
  return result;
}

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 * Deterministically serializes a JavaScript object/value.
 */
export function canonicalizeJSON(val: unknown): string {
  if (val === null) {
    return 'null';
  }

  const type = typeof val;

  if (type === 'boolean') {
    return val ? 'true' : 'false';
  }

  if (type === 'number') {
    if (!Number.isFinite(val)) {
      throw new Error(`RFC 8785 JCS error: Non-finite number (${val}) cannot be canonicalized.`);
    }
    // Standard ECMAScript number serialization (compliant with RFC 8785 §3.2.2.3)
    return JSON.stringify(val);
  }

  if (type === 'string') {
    // Escape string according to RFC 8785 §3.2.2.2
    return JSON.stringify(val);
  }

  if (Array.isArray(val)) {
    const parts = val.map(item => (item === undefined ? 'null' : canonicalizeJSON(item)));
    return '[' + parts.join(',') + ']';
  }

  if (type === 'object') {
    const obj = val as Record<string, unknown>;
    // Sort object keys by UTF-16 code units (RFC 8785 §3.2.3)
    const sortedKeys = Object.keys(obj)
      .filter(k => obj[k] !== undefined)
      .sort((a, b) => {
        // UTF-16 code-unit comparison
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
          const codeA = a.charCodeAt(i);
          const codeB = b.charCodeAt(i);
          if (codeA !== codeB) return codeA - codeB;
        }
        return a.length - b.length;
      });

    const entries = sortedKeys.map(k => {
      const keySerialized = JSON.stringify(k);
      const valSerialized = canonicalizeJSON(obj[k]);
      return `${keySerialized}:${valSerialized}`;
    });

    return '{' + entries.join(',') + '}';
  }

  throw new Error(`Unsupported type for canonicalization: ${type}`);
}
