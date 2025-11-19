const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

console.log('📦 Creating deployment.zip for shared hosting...\n');

// Step 1: Verify build folder exists
if (!fs.existsSync('build')) {
  console.error('❌ Build folder not found! Please run "npm run build" first.');
  process.exit(1);
}

// Step 2: Copy .htaccess to build folder
if (fs.existsSync('.htaccess')) {
  fs.copyFileSync('.htaccess', path.join('build', '.htaccess'));
  console.log('✅ .htaccess copied to build folder');
} else {
  console.log('⚠️  .htaccess not found in root, creating default...');
  const defaultHtaccess = `<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /charts/
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME} !-l
  RewriteRule . /charts/index.html [L]
</IfModule>

# Enable compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>

# Cache static assets
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpg "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/gif "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
  ExpiresByType application/json "access plus 0 seconds"
</IfModule>

# Security headers
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-XSS-Protection "1; mode=block"
</IfModule>`;
  fs.writeFileSync(path.join('build', '.htaccess'), defaultHtaccess);
  console.log('✅ Default .htaccess created');
}

// Step 3: Remove old zip if exists
if (fs.existsSync('deployment.zip')) {
  fs.unlinkSync('deployment.zip');
  console.log('🗑️  Removed old deployment.zip');
}

// Step 4: Create zip file
const output = fs.createWriteStream('deployment.zip');
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log('\n================================================');
  console.log('📦 DEPLOYMENT PACKAGE READY!');
  console.log('================================================');
  console.log(`\nFile: deployment.zip (${sizeInMB} MB)`);
  console.log(`Location: ${path.resolve('deployment.zip')}\n`);
  console.log('📋 DEPLOYMENT INSTRUCTIONS:');
  console.log('1. Upload deployment.zip to your shared hosting');
  console.log('2. Extract it to your web root directory');
  console.log('   (usually public_html, www, or htdocs)');
  console.log('3. Make sure .htaccess file is in the root');
  console.log('4. Visit your domain to test the application\n');
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
console.log(`\n📁 Adding ${allFiles.length} files to zip...`);

allFiles.forEach(file => {
  const relativePath = path.relative(buildPath, file);
  archive.file(file, { name: relativePath });
});

archive.finalize();





