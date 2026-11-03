'use strict';

require('dotenv').config();

const { createAdminAccount, db } = require('./server.js');

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('Ejecuta este comando en una terminal interactiva para proteger la contraseña.'));
      return;
    }

    let value = '';
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
    };
    const onData = (chunk) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Operación cancelada.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ' && character !== '\u007f') {
          value += character;
        }
      }
    };

    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main() {
  const username = process.argv[2] || '';
  if (!username) throw new Error('Uso: npm run admin:create -- nombre_de_usuario');
  const password = await readHidden('Nueva contraseña (mínimo 14 caracteres): ');
  const confirmation = await readHidden('Repite la contraseña: ');
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
  await createAdminAccount(username, password);
  console.log('Cuenta administrativa creada. La contraseña se guardó con hash y salt.');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
