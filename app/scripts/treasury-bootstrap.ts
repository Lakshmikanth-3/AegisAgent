import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ZetarisClient } from '../src/lib/treasury/zetaris';

async function main() {
  const client = new ZetarisClient();
  const container = process.env.ZETARIS_DRIVER_CONTAINER || 'zetaris-driver-1';
  const dataPath = process.env.ZETARIS_DATA_PATH || '/home/zetaris/customer-data/shared/aegis';
  if (!process.argv.includes('--skip-copy')) {
    execFileSync('docker', ['exec', container, 'mkdir', '-p', dataPath], { stdio: 'inherit' });
    execFileSync('docker', ['cp', path.resolve('../data') + '/.', `${container}:${dataPath}`], { stdio: 'inherit' });
  }
  const existing = await client.execute('SHOW LIGHTNING DATABASES');
  const databases = JSON.stringify(existing).toUpperCase();
  for (const db of ['AEGIS_ERP', 'AEGIS_REGISTRY', 'AEGIS_TREASURY']) {
    if (!databases.includes(db)) await client.execute(`CREATE LIGHTNING DATABASE ${db} DESCRIBE BY "AegisAgent synthetic enterprise exports"`);
  }
  for (const [db, table, file] of [['AEGIS_REGISTRY', 'suppliers', 'registry/suppliers.csv'], ['AEGIS_ERP', 'purchase_orders', 'erp/purchase-orders.csv'], ['AEGIS_ERP', 'invoices', 'erp/invoices.csv'], ['AEGIS_TREASURY', 'balances', 'treasury/balances.csv']]) {
    const tables = await client.execute(`SHOW LIGHTNING TABLES ${db}`);
    if (!JSON.stringify(tables).toLowerCase().includes(`"${table}"`)) await client.execute(`CREATE LIGHTNING FILESTORE TABLE ${table} FROM ${db} FORMAT CSV OPTIONS (path "${dataPath}/${file}", header "true", inferSchema "false")`);
    const result = await client.query(`SELECT * FROM ${db}.${table}`);
    console.log(JSON.stringify({ source: `${db}.${table}`, rows: result.rows.length, status: 'ready' }));
  }
}
main().catch(error => { console.error('Zetaris bootstrap failed:', error instanceof Error ? error.message : 'Check Docker, data path, organization and server-only credentials.'); process.exitCode = 1; });
