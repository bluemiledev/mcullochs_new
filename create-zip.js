const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('Creating deployment.zip...');

if (fs.existsSync('deployment.zip')) {
  fs.unlinkSync('deployment.zip');
}

if (fs.existsSync('.htaccess')) {
  fs.copyFileSync('.htaccess', path.join('build', '.htaccess'));
}

const output = fs.createWriteStream('deployment.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log('SUCCESS: deployment.zip created (' + sizeMB + ' MB)');
  console.log('Location: ' + path.resolve('deployment.zip'));
});

archive.on('error', (err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});

archive.pipe(output);

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (!file.endsWith('.map')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const allFiles = getAllFiles('build');
allFiles.forEach(file => {
  archive.file(file, { name: path.relative('build', file) });
});

archive.finalize();





