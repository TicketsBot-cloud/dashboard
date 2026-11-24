// The `url` package's legacy parse that Discord's link finder runs.

export interface LegacyUrl {
  protocol: string | null;
  host: string | null;
  pathname: string | null;
  query: string | null;
}

const SIMPLE_PATH = /^(\/\/?(?!\/)[^?\s]*)(\?[^\s]*)?$/;
const PROTOCOL = /^[a-z0-9.+-]+:/i;
const SLASHED_AUTH = /^\/\/[^@/]+@[^@/]+/;
const SLASHED_PROTOCOLS = ["http:", "https:", "ftp:", "gopher:", "file:"];
const HOST_ENDING = /[/?#]/;
const NON_HOST = /[%/?;#'{}|\\^`<>" \r\n\t]/;
const PORT = /:[0-9]*$/;
const HOST_LABEL = /^[+a-z0-9A-Z_-]{0,63}$/;
const HOST_LABEL_START = /^([+a-z0-9A-Z_-]{0,63})(.*)$/;
const NON_ASCII_UNIT = /[\u0080-\uffff]/g;
// Punycode encoding is skipped: hosts are only compared with ASCII ones.
const IDN_SEPARATORS = /[\u3002\uff0e\uff61]/g;
const AUTO_ESCAPE = /['{}|\\^`<>" \r\n\t]/g;

function isCodableUserinfo(auth: string): boolean {
  try {
    encodeURIComponent(decodeURIComponent(auth));
    return true;
  } catch {
    return false;
  }
}

export function legacyParse(input: string): LegacyUrl | null {
  const url: LegacyUrl = { protocol: null, host: null, pathname: null, query: null };
  const queryStart = input.indexOf("?");
  const splitter = queryStart !== -1 && queryStart < input.indexOf("#") ? "?" : "#";
  const parts = input.split(splitter);
  parts[0] = parts[0].replace(/\\/g, "/");
  const slashed = parts.join(splitter);
  let rest = slashed.trim();

  if (!slashed.includes("#")) {
    const simple = SIMPLE_PATH.exec(rest);
    if (simple) {
      url.pathname = simple[1];
      if (simple[2]) url.query = simple[2].substring(1);
      return url;
    }
  }

  // Lookups use the protocol as typed, so "HTTP:" isn't a slashed protocol.
  const protocol = PROTOCOL.exec(rest)?.[0];
  if (protocol) {
    url.protocol = protocol.toLowerCase();
    rest = rest.substring(protocol.length);
  }
  const hostless = protocol === "javascript:";
  let slashes = false;
  if (protocol || SLASHED_AUTH.test(rest)) {
    slashes = rest.startsWith("//");
    if (slashes && !hostless) rest = rest.substring(2);
  }

  let hostname = "";
  if (!hostless && (slashes || (protocol && !SLASHED_PROTOCOLS.includes(protocol)))) {
    const hostEnd = rest.search(HOST_ENDING);
    const at = hostEnd === -1 ? rest.lastIndexOf("@") : rest.lastIndexOf("@", hostEnd);
    if (at !== -1) {
      if (!isCodableUserinfo(rest.slice(0, at))) return null;
      rest = rest.slice(at + 1);
    }
    const nonHost = rest.search(NON_HOST);
    hostname = nonHost === -1 ? rest : rest.slice(0, nonHost);
    rest = rest.slice(hostname.length);
    let port = "";
    const portMatch = PORT.exec(hostname);
    if (portMatch) {
      port = portMatch[0].substring(1);
      hostname = hostname.slice(0, portMatch.index);
    }

    const ipv6 = hostname.startsWith("[") && hostname.endsWith("]");
    if (!ipv6) {
      const labels = hostname.split(".");
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        if (!label || HOST_LABEL.test(label.replace(NON_ASCII_UNIT, "x"))) continue;
        const valid = labels.slice(0, i);
        const notHost = labels.slice(i + 1);
        const start = HOST_LABEL_START.exec(label);
        if (start) {
          valid.push(start[1]);
          notHost.unshift(start[2]);
        }
        if (notHost.length) rest = `/${notHost.join(".")}${rest}`;
        hostname = valid.join(".");
        break;
      }
    }
    hostname = hostname.length > 255 ? "" : hostname.toLowerCase();
    if (!ipv6) hostname = hostname.replace(IDN_SEPARATORS, ".");
    url.host = port ? `${hostname}:${port}` : hostname;
    if (ipv6 && !rest.startsWith("/")) rest = `/${rest}`;
  }

  if (url.protocol !== "javascript:") {
    rest = rest.replace(AUTO_ESCAPE, (char) => (char === "'" ? "%27" : encodeURIComponent(char)));
  }
  const hash = rest.indexOf("#");
  if (hash !== -1) rest = rest.slice(0, hash);
  const queryIndex = rest.indexOf("?");
  if (queryIndex !== -1) {
    url.query = rest.slice(queryIndex + 1);
    rest = rest.slice(0, queryIndex);
  }
  if (rest) url.pathname = rest;
  if (url.protocol && SLASHED_PROTOCOLS.includes(url.protocol) && hostname && !url.pathname) {
    url.pathname = "/";
  }
  return url;
}
