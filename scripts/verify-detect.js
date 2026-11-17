// Verificación de systeminformation en esta máquina: imprime los valores
// reales que usará detect() y el objeto completo del contrato.
// 2.3.1: además corre detectChecks() de verdad y muestra qué puntos del
// checklist se disparan en esta máquina (en Linux solo t3/t4 son
// determinables; el resto queda sin marcar por ser chequeos de Windows).
// Uso: pnpm verify-detect
'use strict';

const si = require('systeminformation');
const { detectMachine, detectChecks } = require('../detect');

(async () => {
  const [system, osInfo, cpu, mem, disks, chassis, ifaces, battery] = await Promise.all([
    si.system(),
    si.osInfo(),
    si.cpu(),
    si.mem(),
    si.diskLayout(),
    si.chassis(),
    si.networkInterfaces(),
    si.battery(),
  ]);
  console.log('hostname:', osInfo.hostname);
  console.log('manufacturer:', system.manufacturer);
  console.log('model:', system.model);
  console.log('serial:', system.serial);
  console.log('cpu.brand:', cpu.brand);
  console.log('mem.total (bytes):', mem.total);
  console.log('mem.total (GB, Math.round /1e9):', Math.round(mem.total / 1e9));
  console.log('diskLayout:', JSON.stringify(disks, null, 2));
  console.log('chassis.type:', chassis.type);
  console.log('osInfo.distro:', osInfo.distro, '| release:', osInfo.release);
  console.log(
    'networkInterfaces (no internas):',
    JSON.stringify(
      ifaces.filter((n) => !n.internal).map((n) => ({ iface: n.iface, mac: n.mac, ip4: n.ip4 })),
      null,
      2
    )
  );
  console.log('--- objeto detect() ---');
  const machine = await detectMachine();
  console.log(JSON.stringify(machine, null, 2));
  console.log('battery:', JSON.stringify(battery));
  console.log('--- detectChecks() real (esta VM) ---');
  console.log(JSON.stringify(await detectChecks({ serial: machine.serie }), null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
