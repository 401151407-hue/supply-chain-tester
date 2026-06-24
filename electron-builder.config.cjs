/** @type {import('electron-builder').Configuration} */

module.exports = {
  appId: 'com.supplychain.tester',
  productName: 'SupplyChainTester',
  directories: {
    output: 'dist',
  },
  files: [
    'out/**/*',
  ],
  asarUnpack: [
    '**/node_modules/playwright/**',
  ],
  extraResources: [
  ],
  win: {
    target: ['nsis'],
    icon: null,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    artifactName: '${productName}-${version}-Windows.${ext}',
  },
  mac: {
    target: [
      { target: 'dmg', arch: ['x64'] },
      { target: 'dmg', arch: ['arm64'] },
      { target: 'zip', arch: ['x64'] },
      { target: 'zip', arch: ['arm64'] },
    ],
    // 未签名 App 跳过 Gatekeeper 评估
    gatekeeperAssess: false,
    hardenedRuntime: false,
    // 签名（没有 Apple Developer 账号时用 adhoc 签名）
    identity: null,
    // 输出文件名格式：SupplyChainTester-0.1.0-Mac-arm64.dmg
    artifactName: '${productName}-${version}-Mac-${arch}.${ext}',
  },
  linux: {
    target: ['AppImage'],
  },
  publish: {
    provider: 'github',
    owner: '401151407-hue',
    repo: 'supply-chain-tester',
    releaseType: 'release',
  },
  releaseInfo: {
    releaseNotesFile: 'RELEASE_NOTES.md',
  },
}
