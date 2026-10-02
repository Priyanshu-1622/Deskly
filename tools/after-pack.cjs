const path = require('node:path');
module.exports = async context => {
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  const product = context.packager.appInfo.productFilename;
  const binary = context.electronPlatformName === 'darwin' ? path.join(context.appOutDir, `${product}.app`) : path.join(context.appOutDir, context.electronPlatformName === 'win32' ? `${product}.exe` : context.packager.appInfo.executableName);
  await flipFuses(binary, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: context.electronPlatformName !== 'linux',
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false
  });
};
