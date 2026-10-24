// Numeric codes belong to Chromium page loading, not process exit codes.
// Reference: chromium/src/net/base/net_error_list.h
const pageErrors = [
  [-2, 'FAILED', 'The page could not load; no specific cause was reported.'],
  [-3, 'ABORTED', 'The page load was cancelled.'],
  [-6, 'FILE_NOT_FOUND', 'A file needed to load the page could not be found.'],
  [-7, 'TIMED_OUT', 'The request took too long and timed out.'],
  [-10, 'ACCESS_DENIED', 'Access to the requested resource was denied.'],
  [-20, 'BLOCKED_BY_CLIENT', 'The browser or client software blocked the request.'],
  [-21, 'NETWORK_CHANGED', 'The network connection changed while the page was loading.'],
  [-100, 'CONNECTION_CLOSED', 'The connection closed before the page finished loading.'],
  [-101, 'CONNECTION_RESET', 'The connection was unexpectedly reset.'],
  [-102, 'CONNECTION_REFUSED', 'The connection attempt was refused.'],
  [-103, 'CONNECTION_ABORTED', 'The connection attempt was interrupted.'],
  [-104, 'CONNECTION_FAILED', 'A connection to the website could not be established.'],
  [-105, 'NAME_NOT_RESOLVED', 'The website address could not be found (DNS lookup failed).'],
  [-106, 'INTERNET_DISCONNECTED', 'The device had no internet connection when the page tried to load.'],
  [-107, 'SSL_PROTOCOL_ERROR', 'A secure connection to the website could not be established.'],
  [-108, 'ADDRESS_INVALID', 'The network address was invalid.'],
  [-109, 'ADDRESS_UNREACHABLE', 'The network could not reach the website address.'],
  [-118, 'CONNECTION_TIMED_OUT', 'The connection attempt took too long and timed out.'],
  [-130, 'PROXY_CONNECTION_FAILED', 'A connection to the configured proxy server could not be established.'],
  [-137, 'NAME_RESOLUTION_FAILED', 'The DNS service could not resolve the website address.'],
  [-138, 'NETWORK_ACCESS_DENIED', 'Network access was denied; a firewall or security setting may be blocking it.'],
  [-200, 'CERT_COMMON_NAME_INVALID', 'The website security certificate did not match its address.'],
  [-201, 'CERT_DATE_INVALID', 'The website security certificate was outside its valid dates; the device clock may also be incorrect.'],
  [-202, 'CERT_AUTHORITY_INVALID', 'The website security certificate was not trusted.'],
  [-300, 'INVALID_URL', 'The page address was invalid.'],
  [-301, 'DISALLOWED_URL_SCHEME', 'The browser did not allow this type of page address.'],
  [-302, 'UNKNOWN_URL_SCHEME', 'The browser did not recognise this type of page address.'],
  [-310, 'TOO_MANY_REDIRECTS', 'The website redirected too many times, possibly in a loop.'],
  [-320, 'INVALID_RESPONSE', 'The website returned a response the browser could not understand.'],
  [-324, 'EMPTY_RESPONSE', 'The website closed the connection without sending a response.'],
];
const pageCodes = new Map(pageErrors.map(([code, name, message]) => [code, { name: `ERR_${name}`, message }]));
const pageNames = new Map([...pageCodes.values()].map(error => [error.name, error]));
const systemErrors = new Map(Object.entries({
  ENOTFOUND: 'A server address could not be found (DNS lookup failed).',
  EAI_AGAIN: 'The DNS lookup failed temporarily; a later attempt may succeed.',
  ECONNREFUSED: 'The connection attempt was refused.',
  ECONNRESET: 'The connection was unexpectedly reset.',
  ECONNABORTED: 'The connection was interrupted.',
  ETIMEDOUT: 'The operation took too long and timed out.',
  ENETUNREACH: 'The network could not be reached.',
  EHOSTUNREACH: 'The server could not be reached.',
  ENOENT: 'A required file or folder could not be found.',
  EACCES: 'Permission to access a required resource was denied.',
  EPERM: 'The operating system did not permit the operation.',
  ENOSPC: 'There was no space left on the storage device.',
  EBUSY: 'A required resource was busy or locked.',
  EEXIST: 'A file or folder already existed where a new one was expected.',
}));

export function diagnosticErrorMeaning(event, code) {
  if (event === 'load-failed') {
    const error = typeof code === 'number' ? pageCodes.get(code) : pageNames.get(code);
    if (error) return `${error.message}\n${error.name}`;
  }
  if (typeof code === 'string' && systemErrors.has(code)) return systemErrors.get(code);
  // Renderer and process exit codes use a different namespace; never interpret
  // their numeric values as Chromium network failures.
  if (event === 'renderer-crashed') return 'The page renderer stopped. This is a process exit code; see Stage / reason for more detail.';
  return 'No plain-English explanation is available for this code.';
}
