import 'dotenv/config';

async function test() {
  try {
    console.log('1: importing projects...');
    await import('./src/routes/projects.js');
    console.log('   projects OK');
  } catch(e: any) { console.error('   projects FAIL:', e.message); }

  try {
    console.log('2: importing execute...');
    await import('./src/routes/execute.js');
    console.log('   execute OK');
  } catch(e: any) { console.error('   execute FAIL:', e.message); }

  try {
    console.log('3: importing events...');
    await import('./src/routes/events.js');
    console.log('   events OK');
  } catch(e: any) { console.error('   events FAIL:', e.message); }

  try {
    console.log('4: importing oauth...');
    await import('./src/routes/oauth.js');
    console.log('   oauth OK');
  } catch(e: any) { console.error('   oauth FAIL:', e.message); }

  try {
    console.log('5: importing credentials...');
    await import('./src/routes/credentials.js');
    console.log('   credentials OK');
  } catch(e: any) { console.error('   credentials FAIL:', e.message); }

  process.exit(0);
}

test();
