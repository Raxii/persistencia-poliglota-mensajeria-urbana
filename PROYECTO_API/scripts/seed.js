'use strict';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const {Pool} = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const pool = new Pool({connectionString: process.env.DATABASE_URL});
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const nombre of ['Centro', 'Norte', 'Sur']) {
      await db.query('INSERT INTO zonas (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [nombre]);
    }
    const rep = await db.query(`
      INSERT INTO repartidores (codigo, nombre, zona_id, capacidad_maxima)
      VALUES ('REP-001','Repartidor Ficticio Uno', (SELECT id FROM zonas WHERE nombre='Centro'), 2)
      ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre
      RETURNING id
    `);
    await db.query(`
      INSERT INTO repartidores (codigo, nombre, zona_id, capacidad_maxima)
      VALUES ('REP-002','Repartidor Ficticio Dos', (SELECT id FROM zonas WHERE nombre='Norte'), 1)
      ON CONFLICT (codigo) DO NOTHING
    `);
    const hash = await bcrypt.hash(process.env.DEMO_PASSWORD || 'Demo2026!', 10);
    for (const [usuario, rol, repartidorId] of [
      ['cliente_demo','cliente',null],
      ['operador_demo','operador',null],
      ['admin_demo','administrador',null],
      ['repartidor_demo','repartidor',rep.rows[0].id]
    ]) {
      await db.query(`INSERT INTO usuarios_demo (usuario, clave_hash, rol, repartidor_id)
        VALUES ($1,$2,$3,$4) ON CONFLICT (usuario) DO UPDATE SET clave_hash=EXCLUDED.clave_hash, rol=EXCLUDED.rol, repartidor_id=EXCLUDED.repartidor_id`,
        [usuario,hash,rol,repartidorId]);
    }
    await db.query('COMMIT');
    console.log('Datos ficticios cargados. Usuarios de demo listos.');
  } catch (error) {
    await db.query('ROLLBACK'); throw error;
  } finally {
    db.release(); await pool.end();
  }
}
main().catch(err => {console.error('Error inicializando datos:', err.message); process.exitCode = 1;});
