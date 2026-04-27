const bcrypt = require('bcrypt');

// Generate PIN hashes for demo staff
async function main() {
  const pins = [
    { name: 'Patron (Owner)', pin: '1234', role: 'owner' },
    { name: 'Mehmet (Garson)', pin: '5678', role: 'waiter' },
    { name: 'Ahmet (Şef)', pin: '9999', role: 'head_waiter' },
    { name: 'Elif (Garson)', pin: '1111', role: 'waiter' },
  ];

  for (const p of pins) {
    const hash = await bcrypt.hash(p.pin, 10);
    console.log(`-- ${p.name}: PIN=${p.pin}`);
    console.log(`   '${hash}'`);
    console.log();
  }
}

main();
