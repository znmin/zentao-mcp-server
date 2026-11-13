import { readFile, stat } from 'node:fs/promises';
import { basename, win32, isAbsolute } from 'node:path';

export function deploymentUrl(baseUrl, relativePath) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('ZENTAO_BASE_URL must be HTTP(S), without credentials, query or fragment');
  }
  if (typeof relativePath !== 'string' || !relativePath || /[\\?#]/.test(relativePath) || /%2[ef]|%5c/i.test(relativePath) || relativePath.startsWith('//') || /^[a-z]+:/i.test(relativePath) || /(^|\/)\.{1,2}(\/|$)/.test(relativePath)) {
    throw new Error('API path must stay within the configured deployment directory');
  }
  const root = base.href.replace(/\/+$/, '') + '/';
  const url = new URL(relativePath.replace(/^\/+/, ''), root);
  if (url.origin !== base.origin || !url.pathname.startsWith(new URL(root).pathname)) throw new Error('API path escapes deployment');
  return url;
}

function containsFile(files, fileId) {
  if (!files || typeof files !== 'object') return false;
  return Object.entries(files).some(([key, value]) => String(value?.id ?? value?.fileID ?? key) === String(fileId));
}

export async function uploadAttachment({baseUrl, uploadPath, timeoutMs, maxUploadBytes, getToken, call}, {bugId,filePath,fileName}) {
  if (!Number.isSafeInteger(bugId) || bugId < 1) throw new Error('bugId must be a positive integer');
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) throw new Error('filePath must be an absolute path on the runtime computer');
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('filePath must point to a regular file');
  if (info.size > maxUploadBytes) throw new Error(`Attachment exceeds limit of ${maxUploadBytes} bytes`);
  const displayName = fileName || win32.basename(basename(filePath));
  if (!displayName || /[\r\n\0/\\]/.test(displayName)) throw new Error('fileName must be a filename without path separators or control characters');
  // Confirm access before making any attachment write.
  await call({path:`/bugs/${bugId}`});
  const data = await readFile(filePath);
  if (data.length > maxUploadBytes) throw new Error(`Attachment exceeds limit of ${maxUploadBytes} bytes`);
  const form = new FormData();
  form.set('file',new Blob([data]),displayName);
  form.set('objectType','bug');
  form.set('objectID',String(bugId));
  const token = await getToken();
  let response, payload;
  try {
    response = await fetch(deploymentUrl(baseUrl,uploadPath),{
      method:'POST',headers:{Token:token.token},body:form,
      signal:AbortSignal.timeout(timeoutMs),redirect:'error',
    });
    if (!response.ok) throw new Error(`Attachment upload failed: HTTP ${response.status}. Check ZenTao 22+ REST v2 support and file upload permission.`);
    payload = await response.json();
  } catch(error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('Attachment upload timed out; check Bug attachments before retrying to avoid duplicates');
    if (error instanceof SyntaxError) throw new Error('Attachment upload returned non-JSON content; check the upload endpoint and authentication');
    throw error;
  }
  if (payload?.status === 'fail' || payload?.status === 'error' || payload?.result === 'fail' || payload?.error) throw new Error('ZenTao rejected the attachment upload');
  const fileId = Number(payload?.id ?? payload?.data?.id ?? payload?.fileID);
  if (!Number.isSafeInteger(fileId) || fileId < 1) throw new Error('Upload response has no valid file ID; check Bug attachments before retrying');
  let linked = false, verificationError;
  try {
    const detail = await call({path:`/bugs/${bugId}`});
    linked = containsFile(detail?.data?.files ?? detail?.data?.data?.files,fileId);
    if (!linked) verificationError = 'Uploaded file was not present in the Bug attachment list on read-back';
  } catch { verificationError = 'Upload succeeded but Bug attachment read-back failed'; }
  return {fileId,bugId,fileName:displayName,uploaded:true,linked,verified:linked,...(verificationError ? {verificationError,doNotRetryUpload:true} : {})};
}
