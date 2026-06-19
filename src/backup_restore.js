import fs from 'fs';
try {
  console.log('Listing /workspace:');
  console.log(fs.readdirSync('/workspace'));
} catch (e) {
  console.log('Error:', e.message);
}
