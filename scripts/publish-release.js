// 直接通过 GitHub API 上传 Release
const fs = require('fs');
const https = require('https');

const token = process.env.GH_TOKEN;
const owner = '401151407-hue';
const repo = 'supply-chain-tester';
const version = '0.2.23';
const filePath = `dist/SupplyChainTester-${version}-Windows.exe`;

if (!token) { console.error('GH_TOKEN not set'); process.exit(1); }
if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }

const fileStats = fs.statSync(filePath);
console.log(`Uploading ${filePath} (${(fileStats.size / 1024 / 1024).toFixed(1)} MB)...`);

// Create release
const body = JSON.stringify({
  tag_name: `v${version}`,
  name: `v${version}`,
  body: 'API调试模块优化：协议自动检测、滑动动画、提取变量可视化、可拖拽响应区、历史记录折叠',
  draft: false,
  prerelease: false
});

const req = https.request({
  hostname: 'api.github.com',
  path: `/repos/${owner}/${repo}/releases`,
  method: 'POST',
  headers: {
    'Authorization': `token ${token}`,
    'User-Agent': 'electron-builder',
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode !== 201) {
      // Release might already exist, try to get it
      console.log(`Release create status: ${res.statusCode}. Checking if exists...`);
      const getReq = https.request({
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repo}/releases/tags/v${version}`,
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'electron-builder',
          'Accept': 'application/vnd.github.v3+json'
        }
      }, (getRes) => {
        let getData = '';
        getRes.on('data', chunk => getData += chunk);
        getRes.on('end', () => {
          if (getRes.statusCode === 200) {
            const release = JSON.parse(getData);
            uploadAsset(release.upload_url, token, filePath, version);
          } else {
            console.error('Failed to find release:', getData);
          }
        });
      });
      getReq.end();
      return;
    }
    const release = JSON.parse(data);
    uploadAsset(release.upload_url, token, filePath, version);
  });
});

req.on('error', (e) => console.error('Request error:', e));
req.write(body);
req.end();

function uploadAsset(uploadUrl, token, filePath, version) {
  const cleanUrl = uploadUrl.replace('{?name,label}', `?name=SupplyChainTester-${version}-Windows.exe`);
  const fileContent = fs.readFileSync(filePath);
  const uploadReq = https.request({
    hostname: 'uploads.github.com',
    path: new URL(cleanUrl).pathname + new URL(cleanUrl).search,
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'User-Agent': 'electron-builder',
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileContent.length
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 201) {
        console.log('✅ 发布成功！');
      } else {
        console.error('Upload failed:', res.statusCode, data);
      }
    });
  });
  uploadReq.on('error', (e) => console.error('Upload error:', e));
  uploadReq.write(fileContent);
  uploadReq.end();
}
