export const attachmentLimit = 350 * 1024;
export const attachmentTypes = ['image/png','image/jpeg','image/webp','application/pdf'];
export function attachmentBytes(file) {
  const match = /^data:(image\/png|image\/jpeg|image\/webp|application\/pdf);base64,([A-Za-z0-9+/]*={0,2})$/.exec(file?.data || '');
  if (!match || match[1] !== file.type || match[2].length > Math.ceil(attachmentLimit / 3) * 4 || match[2].length % 4) throw Error('PNG·JPG·WebP·PDF 파일만 첨부할 수 있어요.');
  let binary;try { binary = atob(match[2]); } catch { throw Error('첨부 파일을 읽을 수 없어요.'); }
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (!bytes.length || bytes.length > attachmentLimit) throw Error('첨부 파일은 각각 350KB 이하여야 해요.');
  const signature = (...values) => values.every((v,i) => bytes[i] === v);
  const valid = file.type === 'image/png' ? signature(137,80,78,71,13,10,26,10) : file.type === 'image/jpeg' ? signature(255,216,255) : file.type === 'application/pdf' ? signature(37,80,68,70,45) : signature(82,73,70,70) && [87,69,66,80].every((v,i) => bytes[i+8] === v);
  if (!valid) throw Error('파일 내용과 확장자가 맞지 않아요. 다른 파일을 선택해주세요.');
  return bytes;
}
export function cleanAttachments(files = []) {
  if (!Array.isArray(files) || files.length > 2) throw Error('예약마다 파일은 최대 2개까지 첨부할 수 있어요.');
  return files.map(file => ({ name: String(file.name || '예약 파일').replace(/[\\/\u0000-\u001f]/g,'').slice(0,160), type: file.type, size: attachmentBytes(file).length, data: file.data }));
}
