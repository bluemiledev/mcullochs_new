const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('📦 Creating deployment.zip from existing build...\n');

// Remove old zip if exists
if (fs.existsSync('deployment.zip')) {
  fs.unlinkSync('deployment.zip');
  console.log('Removed old deployment.zip\n');
}

// Copy .htaccess to build if it exists
if (fs.existsSync('.htaccess')) {
  fs.copyFileSync('.htaccess', path.join('build', '.htaccess'));
  console.log('✅ .htaccess copied to build folder\n');
}

const output = fs.createWriteStream('deployment.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log('================================================');
  console.log('📦 DEPLOYMENT PACKAGE READY!');
  console.log('================================================');
  console.log(`\nFile: deployment.zip (${sizeInMB} MB)`);
  console.log(`Location: ${path.resolve('deployment.zip')}\n`);
});

archive.on('error', (err) => {
  console.error('❌ Error creating zip file:', err.message);
  process.exit(1);
});

archive.pipe(output);

// Add all files from build folder, excluding source maps
const buildPath = path.join(process.cwd(), 'build');

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      // Exclude source maps
      if (!file.endsWith('.map')) {
        fileList.push(filePath);
      }
    }
  });
  return fileList;
}

const allFiles = getAllFiles(buildPath);
console.log(`Adding ${allFiles.length} files to zip...\n`);

allFiles.forEach(file => {
  const relativePath = path.relative(buildPath, file);
  archive.file(file, { name: relativePath });
});

archive.finalize();






