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
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
    ],
    icon: null,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    artifactName: '${productName}-${version}-Windows.${ext}',
    include: 'build/installer.nsh',
  },
  mac: {
    target: [
      { target: 'dmg', arch: ['x64'] },
      { target: 'dmg', arch: ['arm64'] },
    ],
    gatekeeperAssess: false,
    hardenedRuntime: false,
    identity: null,
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
