// Bundles web/ into ONE self-contained HTML file: dist/pass-the-ace.html
const fs = require('fs'), path = require('path');
const web = path.join(__dirname, '..', 'web');
let html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, f) => `<style>\n${fs.readFileSync(path.join(web, f), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => `<script>\n${fs.readFileSync(path.join(web, f), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
const out = path.join(__dirname, '..', 'dist', 'pass-the-ace.html');
fs.writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');
