import 'dotenv/config';

// Standalone RCON connectivity + parser check. Run this FIRST on the live server
// to validate the protocol in isolation, before worrying about the web UI.
//   npm run rcon:probe
// Reads RCON_HOST / RCON_PORT / RCON_PASSWORD from server/.env (or the env).
async function main() {
  const host = process.env.RCON_HOST;
  const password = process.env.RCON_PASSWORD;
  const port = Number(process.env.RCON_PORT ?? 8888);

  if (!host || !password) {
    console.error('Missing config. Set RCON_HOST and RCON_PASSWORD in server/.env');
    console.error('(copy .env.example to .env and fill them in), then re-run.');
    process.exit(1);
  }

  // Force the raw response dump on so you can see exactly what the server sends.
  process.env.RCON_DEBUG = '1';
  const { EvrimaRconDataSource } = await import('./datasource/EvrimaRconDataSource.js');

  const ds = new EvrimaRconDataSource({
    host,
    port,
    password,
    worldBounds: { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000 },
  });

  console.log(`Probing Evrima RCON at ${host}:${port} …\n`);
  try {
    await ds.connect();
    const players = await ds.getPlayerData();

    console.log(`\n=== Parsed ${players.length} player(s) ===`);
    console.log(JSON.stringify(players, null, 2));

    if (players.length === 0) {
      console.log('\n⚠  No players were parsed.');
      console.log('   - If the raw dump above is empty, no one is online (spawn in and re-run).');
      console.log('   - If the raw dump HAS player data, the response layout differs from the');
      console.log('     parser. Edit parsePlayerData() in src/datasource/EvrimaRconDataSource.ts');
      console.log('     to match the field names/format you see, rebuild, and re-run.');
    } else {
      console.log('\n✓ RCON works and the parser understood the response.');
      console.log('  Note the X/Y ranges above to calibrate WORLD_* for the map.');
    }
  } catch (e) {
    console.error('\n✗ Probe failed:', (e as Error).message);
    console.error('  Check: RCON enabled on the server, host/port reachable, password correct.');
    process.exitCode = 1;
  } finally {
    await ds.disconnect();
  }
}

main();
