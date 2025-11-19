const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Creating Deployment Package for Shared Hosting\n');
console.log('================================================\n');

// Step 1: Build the app
console.log('[1/4] Building React application...');
try {
  execSync('npm run build', { stdio: 'inherit', shell: true });
  console.log('✅ Build completed successfully!\n');
} catch (error) {
  console.error('❌ Build failed! Please fix errors and try again.');
  process.exit(1);
}

// Step 2: Verify build folder
if (!fs.existsSync('build')) {
  console.error('❌ Build folder not found! Build may have failed.');
  process.exit(1);
}

// Step 3: Copy .htaccess
console.log('[2/4] Setting up .htaccess file...');
if (fs.existsSync('.htaccess')) {
  fs.copyFileSync('.htaccess', path.join('build', '.htaccess'));
  console.log('✅ .htaccess copied to build folder\n');
} else {
  console.log('⚠️  Creating default .htaccess...');
  const defaultHtaccess = `<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME} !-l
  RewriteRule . /index.html [L]
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
  console.log('✅ Default .htaccess created\n');
}

// Step 4: Create zip file
console.log('[3/4] Creating deployment.zip file...');
try {
  let archiver;
  try {
    archiver = require('archiver');
  } catch (e) {
    console.log('Installing archiver package...');
    execSync('npm install archiver --save-dev', { stdio: 'inherit', shell: true });
    archiver = require('archiver');
  }

  // Remove old zip if exists
  if (fs.existsSync('deployment.zip')) {
    fs.unlinkSync('deployment.zip');
  }

  const output = fs.createWriteStream('deployment.zip');
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log(`✅ Zip file created successfully!\n`);
    console.log('================================================');
    console.log('📦 DEPLOYMENT PACKAGE READY!');
    console.log('================================================');
    console.log(`\nFile: deployment.zip (${sizeInMB} MB)`);
    console.log(`Location: ${path.resolve('deployment.zip')}\n`);
    console.log('📋 DEPLOYMENT INSTRUCTIONS:');
    console.log('1. Upload deployment.zip to your shared hosting');
    console.log('2. Extract it to your web root directory');
    console.log('   (usually public_html, www, or htdocs)');
    console.log('3. Make sure .htaccess file is in the root');
    console.log('4. Visit your domain to test the application');
    console.log('5. If routes don\'t work, check .htaccess is readable\n');
    console.log('✅ Ready to show to your TL!\n');
  });

  archive.on('error', (err) => {
    throw err;
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
  console.log(`   Adding ${allFiles.length} files to zip...`);
  
  allFiles.forEach(file => {
    const relativePath = path.relative(buildPath, file);
    archive.file(file, { name: relativePath });
  });

  archive.finalize();
} catch (error) {
  console.error('❌ Error creating zip file:', error.message);
  console.log('\n💡 Alternative: Manually zip the contents of the "build" folder');
  console.log(`   Build folder: ${path.resolve('build')}`);
  process.exit(1);
}











