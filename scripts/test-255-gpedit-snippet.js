  // --- 2.5.5: directiva local gpedit.msc (Registry.pol + secedit) ---
  function buildRegistryPol(entries) {
    const parts = [Buffer.from('PReg', 'ascii')];
    const ver = Buffer.alloc(4); ver.writeUInt32LE(1, 0); parts.push(ver);
    for (const e of entries) {
      parts.push(Buffer.from('[', 'ascii'));
      parts.push(Buffer.from(e.key + '\0', 'utf16le'));
      parts.push(Buffer.from(';', 'ascii'));
      parts.push(Buffer.from(e.name + '\0', 'utf16le'));
      parts.push(Buffer.from(';', 'ascii'));
      const tb = Buffer.alloc(4); tb.writeUInt32LE(e.type, 0); parts.push(tb);
      let data;
      if (Buffer.isBuffer(e.data)) data = e.data;
      else if (typeof e.data === 'number') { data = Buffer.alloc(4); data.writeUInt32LE(e.data, 0); }
      else data = Buffer.from(String(e.data) + '\0', 'utf16le');
      const sb = Buffer.alloc(4); sb.writeUInt32LE(data.length, 0); parts.push(sb);
      parts.push(data);
      parts.push(Buffer.from(']', 'ascii'));
    }
    return Buffer.concat(parts);
  }
  function seceditInf(lines) {
    return Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(lines.join('\r\n') + '\r\n', 'utf16le')]);
  }
  const POL_M = buildRegistryPol([
    { key: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', name: 'InactivityTimeoutSecs', type: 4, data: 900 },
    { key: 'SOFTWARE\\Policies\\Microsoft\\Windows\\Something', name: 'NoSeUsa', type: 4, data: 1 },
  ]);
  const POL_U = buildRegistryPol([
    { key: 'Software\\Policies\\Microsoft\\Windows\\Control Panel\\Desktop', name: 'ScreenSaveTimeOut', type: 1, data: '600' },
    { key: 'Software\\Policies\\Microsoft\\Windows\\Control Panel\\Desktop', name: 'ScreenSaveActive', type: 1, data: '1' },
  ]);
  const SEC_OK = seceditInf([
    '[Unicode]', 'Unicode=yes', '[System Access]',
    'MinimumPasswordAge = 0', 'MaximumPasswordAge = 60',
    'MinimumPasswordLength = 12', 'PasswordComplexity = 1',
    'LockoutBadCount = 3', 'LockoutDuration = 30', 'ResetLockoutCount = 30',
  ]);
  const SEC_MANUAL = seceditInf([
    '[System Access]', 'MaximumPasswordAge = 90',
    'MinimumPasswordLength = 10', 'PasswordComplexity = 0',
    'LockoutBadCount = 5', 'LockoutDuration = 0', 'ResetLockoutCount = 0',
  ]);

  // Parser Registry.pol.
  check('2.5.5 Registry.pol Machine: InactivityTimeoutSecs 900', parseRegistryPol(POL_M).InactivityTimeoutSecs === 900, parseRegistryPol(POL_M));
  check('2.5.5 Registry.pol ignora valores que no le importan', parseRegistryPol(POL_M).NoSeUsa === undefined, parseRegistryPol(POL_M));
  check('2.5.5 Registry.pol User: ScreenSaveTimeOut 600 (REG_SZ)', parseRegistryPol(POL_U).ScreenSaveTimeOut === 600, parseRegistryPol(POL_U));
  check('2.5.5 Registry.pol User: ScreenSaveActive 1', parseRegistryPol(POL_U).ScreenSaveActive === 1, parseRegistryPol(POL_U));
  check('2.5.5 Registry.pol cabecera mala: {}', eq(parseRegistryPol(Buffer.from('XXXX1234')), {}), parseRegistryPol(Buffer.from('XXXX1234')));
  check('2.5.5 Registry.pol truncado: no rompe', JSON.stringify(parseRegistryPol(POL_M.slice(0, 20))) === '{}', parseRegistryPol(POL_M.slice(0, 20)));

  // Parser secedit.
  check('2.5.5 secedit: cambioDias 60', parseSeceditInf(SEC_OK).cambioDias === 60, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: minLongitud 12', parseSeceditInf(SEC_OK).minLongitud === 12, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: complejidad 1', parseSeceditInf(SEC_OK).complejidad === 1, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: bloqueoIntentos 3', parseSeceditInf(SEC_OK).bloqueoIntentos === 3, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: LockoutDuration 30 min -> 1800 s', parseSeceditInf(SEC_OK).lockoutSegundos === 1800, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: ResetLockoutCount 30 min -> 1800 s', parseSeceditInf(SEC_OK).resetLockoutSegundos === 1800, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: LockoutDuration 30 no es manual', parseSeceditInf(SEC_OK).bloqueoManual === false, parseSeceditInf(SEC_OK));
  check('2.5.5 secedit: LockoutDuration 0 -> bloqueoManual true', parseSeceditInf(SEC_MANUAL).bloqueoManual === true && parseSeceditInf(SEC_MANUAL).lockoutSegundos === 0, parseSeceditInf(SEC_MANUAL));
  check('2.5.5 secedit: MaximumPasswordAge -1 -> cambio null', parseSeceditInf(seceditInf(['[System Access]', 'MaximumPasswordAge = -1'])).cambioDias === null, parseSeceditInf(seceditInf(['[System Access]', 'MaximumPasswordAge = -1'])));
  check('2.5.5 secedit: texto plano (no Buffer) tambien parsea', parseSeceditInf('[System Access]\r\nMaximumPasswordAge = 42\r\n').cambioDias === 42, parseSeceditInf('[System Access]\r\nMaximumPasswordAge = 42\r\n'));
  check('2.5.5 secedit vacio: todo null, no manual', eq(parseSeceditInf(''), { cambioDias: null, minLongitud: null, complejidad: null, bloqueoIntentos: null, lockoutSegundos: null, bloqueoManual: false, resetLockoutSegundos: null }), parseSeceditInf(''));

  // politicasCumple con bloqueo manual.
  check('2.5.5 politicasCumple manual: cumpleBloqueo true con 0 s', politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0, bloqueoManual: true }).cumpleBloqueo === true, politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0, bloqueoManual: true }));
  check('2.5.5 politicasCumple manual: cumple true', politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0, bloqueoManual: true }).cumple === true, politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0, bloqueoManual: true }));
  check('2.5.5 politicasCumple 0 s sin manual: cumpleBloqueo false', politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0 }).cumpleBloqueo === false, politicasCumple({ cambioDias: 90, minLongitud: 10, bloqueoIntentos: 5, bloqueoSegundos: 0 }));

  // Integración: gpedit manda (Registry.pol + secedit).
  r = await detectChecks(makeOverrides({
    netAccounts: NET_ES,
    inactivityTimeout: '350',
    screenSave: '1|600',
    polMachine: POL_M,
    polUser: POL_U,
    seceditInf: SEC_OK,
    localUserSistemas: 'sistemas|True',
    files: ['C:\\Users\\sistemas'],
    printers: ['HP LaserJet Pro'],
    uninstall: ['Google Chrome'],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.5 integración gpedit: cambioDias 60 (secedit, no net accounts)', r.detalles.politicas && r.detalles.politicas.cambioDias === 60, r.detalles.politicas);
  check('2.5.5 integración gpedit: minLongitud 12 (secedit)', r.detalles.politicas && r.detalles.politicas.minLongitud === 12, r.detalles.politicas);
  check('2.5.5 integración gpedit: bloqueoIntentos 3 (secedit)', r.detalles.politicas && r.detalles.politicas.bloqueoIntentos === 3, r.detalles.politicas);
  check('2.5.5 integración gpedit: bloqueoSegundos 600 (mínimo de pol 900 y 600)', r.detalles.politicas && r.detalles.politicas.bloqueoSegundos === 600, r.detalles.politicas);
  check('2.5.5 integración gpedit: cumple true', r.detalles.politicas && r.detalles.politicas.cumple === true, r.detalles.politicas);
  check('2.5.5 integración gpedit: fuente gpedit (Registry.pol) + directiva (secedit)', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('gpedit (Registry.pol)') >= 0 && r.detalles.politicasFuente.indexOf('directiva (secedit)') >= 0, r.detalles);
  check('2.5.5 integración gpedit: fuente sin net accounts ni registro', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('net accounts') < 0 && r.detalles.politicasFuente.indexOf('registro') < 0, r.detalles);

  // Integración: secedit sin permisos -> cae a net accounts.
  r = await detectChecks(makeOverrides({
    netAccounts: NET_ES,
    inactivityTimeout: '350',
    screenSave: '1|600',
    seceditFails: true,
    localUserSistemas: '',
    printers: [],
    uninstall: [],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.5 secedit roto: cambioDias 90 (net accounts)', r.detalles.politicas && r.detalles.politicas.cambioDias === 90, r.detalles.politicas);
  check('2.5.5 secedit roto: fuente net accounts + registro', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('net accounts') >= 0 && r.detalles.politicasFuente.indexOf('registro') >= 0, r.detalles);
  check('2.5.5 secedit roto: fuente sin directiva (secedit)', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('directiva (secedit)') < 0, r.detalles);

  // Integración: secedit con LockoutDuration 0 -> bloqueo manual.
  r = await detectChecks(makeOverrides({
    netAccounts: NET_ES,
    inactivityTimeout: '',
    screenSave: '',
    seceditInf: SEC_MANUAL,
    localUserSistemas: '',
    printers: [],
    uninstall: [],
    hotfix: '2026-11-12',
    battery: { hasBattery: false, isCharging: false, percent: 0 },
    serial: 'ABC123',
  }));
  check('2.5.5 manual: bloqueoManual true', r.detalles.politicas && r.detalles.politicas.bloqueoManual === true, r.detalles.politicas);
  check('2.5.5 manual: cumpleBloqueo true', r.detalles.politicas && r.detalles.politicas.cumpleBloqueo === true, r.detalles.politicas);
  check('2.5.5 manual: bloqueoSegundos null (sin inactividad)', r.detalles.politicas && r.detalles.politicas.bloqueoSegundos === null, r.detalles.politicas);
  check('2.5.5 manual: fuente directiva (secedit)', typeof r.detalles.politicasFuente === 'string' && r.detalles.politicasFuente.indexOf('directiva (secedit)') >= 0, r.detalles);
