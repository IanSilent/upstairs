// Builds a single self-contained HTML file (CSS and all scripts inlined) for sharing:
//   node tools/build.js  ->  dist/naverhu.html
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/, function (_, href) {
  return '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '</style>';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (_, src) {
  var js = fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return '<script>\n// ---- ' + src + '\n' + js + '</script>';
});

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
var out = path.join(root, 'dist', 'naverhu.html');
fs.writeFileSync(out, html);
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
