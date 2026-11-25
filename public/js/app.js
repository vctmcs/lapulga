// La Pulga · comportamiento del lado del cliente (sin dependencias)
(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

  // ---------- Mensajes ----------
  $$('[data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('.msg').remove()));

  // ---------- Confirmaciones ----------
  $$('form[data-confirmar]').forEach((f) =>
    f.addEventListener('submit', (e) => { if (!window.confirm(f.dataset.confirmar)) e.preventDefault(); })
  );
  $$('button[data-confirmar-boton]').forEach((b) =>
    b.addEventListener('click', (e) => { if (!window.confirm(b.dataset.confirmarBoton)) e.preventDefault(); })
  );

  // ---------- Mostrar contraseña ----------
  $$('[data-ver-pass]').forEach((chk) =>
    chk.addEventListener('change', () => { document.getElementById(chk.dataset.verPass).type = chk.checked ? 'text' : 'password'; })
  );

  // ---------- WhatsApp igual al teléfono ----------
  $$('[data-mismo-whatsapp]').forEach((chk) => {
    const form = chk.form;
    const tel = $('[name="telefono"]', form);
    const wa = $('[data-whatsapp]', form);
    const sync = () => {
      wa.disabled = chk.checked;
      if (chk.checked) wa.value = tel.value;
    };
    chk.addEventListener('change', sync);
    tel.addEventListener('input', () => chk.checked && (wa.value = tel.value));
    sync();
  });

  // ---------- Registro: el teléfono deja de ser opcional para vendedores ----------
  $$('form[data-registro]').forEach((form) => {
    const opcional = $('[data-opcional]', form);
    if (!opcional) return;
    const actualizar = () => {
      const vendedor = $('input[name="rol"]:checked', form)?.value === 'vendedor';
      opcional.textContent = vendedor ? 'obligatorio para vendedores (o el WhatsApp)' : 'opcional';
    };
    $$('input[name="rol"]', form).forEach((r) => r.addEventListener('change', actualizar));
    actualizar();
  });

  // ---------- Contadores de caracteres ----------
  $$('[data-contar]').forEach((campo) => {
    const max = Number(campo.dataset.contar);
    const c = document.createElement('span');
    c.className = 'ayuda';
    campo.after(c);
    const pintar = () => { c.textContent = `${campo.value.length} / ${max}`; };
    campo.addEventListener('input', pintar);
    pintar();
  });

  // ---------- Precio: vista previa de la regla de donación ----------
  const precio = $('[data-precio]');
  const vista = $('[data-precio-vista]');
  if (precio && vista) {
    const original = vista.innerHTML;
    const pintar = () => {
      const t = precio.value.replace(/[$,\s]/g, '');
      if (t === '') { vista.innerHTML = original; return; }
      if (!/^\d+(\.\d{1,2})?$/.test(t)) { vista.innerHTML = '<span class="error">Solo números, con hasta 2 decimales.</span>'; return; }
      const n = Number(t);
      vista.innerHTML = n === 0
        ? 'Se mostrará como <span class="dona">Donación / Gratis</span>'
        : `Se mostrará como <span class="precio">${moneda.format(n).replace('.00', '')}</span>`;
    };
    precio.addEventListener('input', pintar);
    pintar();
  }

  // ---------- Fotos: arrastrar, previsualizar y limitar ----------
  const inputFotos = $('[data-fotos]');
  if (inputFotos) {
    const zona = $('[data-zona-fotos]');
    const contenedor = $('[data-vista-fotos]');
    const max = Number(inputFotos.dataset.max);
    const permitidos = ['image/jpeg', 'image/png', 'image/webp'];

    const aviso = (texto) => {
      let a = $('[data-aviso-fotos]');
      if (!a) {
        a = document.createElement('span');
        a.className = 'error';
        a.dataset.avisoFotos = '';
        contenedor.after(a);
      }
      a.textContent = texto;
    };

    const pintar = () => {
      contenedor.innerHTML = '';
      Array.from(inputFotos.files).forEach((archivo, i) => {
        const url = URL.createObjectURL(archivo);
        const div = document.createElement('div');
        div.className = 'foto';
        div.innerHTML = `<img src="${url}" alt=""><a href="#" data-quitar="${i}">quitar</a>`;
        div.querySelector('img').onload = () => URL.revokeObjectURL(url);
        contenedor.appendChild(div);
      });
    };

    const fijar = (archivos) => {
      const dt = new DataTransfer();
      const validos = archivos.filter((a) => permitidos.includes(a.type) && a.size <= 5 * 1024 * 1024);
      validos.slice(0, Math.max(0, max)).forEach((a) => dt.items.add(a));
      inputFotos.files = dt.files;
      if (validos.length < archivos.length) aviso('Se omitieron archivos que no son JPG, PNG o WEBP, o que pesan más de 5 MB.');
      else if (validos.length > max) aviso(`Solo se agregaron ${max} foto(s): es el máximo permitido.`);
      else aviso('');
      pintar();
    };

    // Si eligen fotos en varias tandas, se suman
    let previas = [];
    inputFotos.addEventListener('click', () => { previas = Array.from(inputFotos.files); });
    inputFotos.addEventListener('change', () => fijar([...previas, ...Array.from(inputFotos.files)]));

    contenedor.addEventListener('click', (e) => {
      const q = e.target.closest('[data-quitar]');
      if (!q) return;
      e.preventDefault();
      const arr = Array.from(inputFotos.files);
      arr.splice(Number(q.dataset.quitar), 1);
      fijar(arr);
    });

    ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('arrastrando'); }));
    ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove('arrastrando')));
    zona.addEventListener('drop', (e) => {
      e.preventDefault();
      fijar([...Array.from(inputFotos.files), ...Array.from(e.dataTransfer.files)]);
    });
  }

  // Evita doble envío mientras la IA revisa la publicación
  $$('form[data-form-publicacion]').forEach((f) =>
    f.addEventListener('submit', () => {
      const b = $('[data-enviar]', f);
      b.disabled = true;
      b.textContent = 'revisando y publicando...';
    })
  );

  // ---------- Galería ----------
  $$('[data-galeria]').forEach((g) => {
    const principal = $('[data-galeria-principal]', g);
    $$('.miniaturas button', g).forEach((b) =>
      b.addEventListener('click', () => {
        principal.src = b.dataset.src;
        $$('.miniaturas button', g).forEach((x) => x.setAttribute('aria-current', String(x === b)));
      })
    );
  });

  // ---------- Contacto protegido ----------
  $$('[data-contacto]').forEach((caja) => {
    const boton = $('[data-contacto-ver]', caja);
    const datos = $('[data-contacto-datos]', caja);
    if (!boton) return;

    boton.addEventListener('click', async () => {
      boton.disabled = true;
      const texto = boton.textContent;
      boton.textContent = 'cargando...';
      try {
        const r = await fetch(`/publicaciones/${caja.dataset.id}/contacto`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No se pudo obtener el contacto.');

        let html = '';
        if (d.telefono) html += `<div class="contacto-dato">teléfono: <b>${escapar(d.telefono)}</b> &middot; <a href="${escapar(d.telLink)}">llamar</a></div>`;
        if (d.whatsapp) html += `<div class="contacto-dato">whatsapp: <b>${escapar(d.whatsapp)}</b> &middot; <a href="${escapar(d.waLink)}" target="_blank" rel="noopener">escribir</a></div>`;
        if (!html) html = '<p>Este usuario no tiene datos de contacto registrados.</p>';
        datos.innerHTML = html;
        datos.hidden = false;
        boton.remove();
      } catch (err) {
        boton.disabled = false;
        boton.textContent = texto;
        datos.innerHTML = `<p class="error">${escapar(err.message)}</p>`;
        datos.hidden = false;
      }
    });
  });
})();
