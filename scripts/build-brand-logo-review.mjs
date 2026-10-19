// Generates a private review document, never a public app route or build asset.
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { brandProjects } from '../app/brand-projects-data.ts';

const root = new URL('../deployment/brand-logos/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('download-manifest.json', root), 'utf8'));
const css = await readFile(new URL('../app/brand-projects.module.css', import.meta.url), 'utf8');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const cards = [...brandProjects].sort((a, b) => a.displayPriority - b.displayPriority).flatMap(entry => {
  const asset = manifest.find(asset => basename(asset.file).split('.')[0] === entry.id);
  if (!asset) return [];
  const assetName = entry.id === 'sejong-government' ? '정부청사관리본부' : entry.id === 'oci' ? 'OCI 주식회사' : entry.name;
  return [`<li><div class="card"><div class="visual" style="--logo-width:${entry.visualWidth ?? 190}px"><img class="logo" src="pending/${escape(basename(asset.file))}" alt="${escape(assetName)} 공식 로고" width="${entry.logoWidth}" height="${entry.logoHeight}"></div><div class="caption"><strong>${escape(assetName)}</strong><span>공개 사용 승인 대기</span><a class="linkLabel" href="${escape(asset.downloadUrl)}">공식 원본 출처</a></div></div><p class="review-note">${escape(entry.reviewNote)}</p></li>`];
});
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>공식 로고 원본 검토 — 조이플라워 로컬 검토용</title><style>
*{box-sizing:border-box}body{margin:0;background:#faf9f5;color:#173029;font-family:Arial,sans-serif;line-height:1.7}main{max-width:1280px;padding:48px 5%;margin:auto}h1{font-size:28px;font-weight:500}header>p{max-width:850px;color:#637269;font-size:14px}.review-note{font-size:12px;color:#637269;margin:10px 0 0}.grid .card{height:190px}.grid{margin-top:28px}${css}
</style></head><body><main><header><h1>공식 로고 원본 검토</h1><p>로컬 검토 전용입니다. 아래 로고는 공개 사용 승인이 확인되지 않았으며 조이플라워의 공개 페이지에는 표시되지 않습니다. 후보 기관의 시공 사실을 뜻하지 않습니다. 공식 파일의 원본 색상과 비율을 그대로 확인합니다.</p></header><ul class="grid">${cards.join('')}</ul></main></body></html>`;
await writeFile(new URL('review.html', root), html, 'utf8');
console.log(`Generated private review document for ${cards.length} official assets.`);
