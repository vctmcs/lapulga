// La Pulga · comportamiento del lado del cliente (sin dependencias)
(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- Avisos ----------
  $$('[data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('.aviso').remove()));

  // ---------- Menú de usuario: cerrar al hacer clic fuera ----------
  document.addEventListener('click', (e) => {
    $$('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });

  // ---------- Orden: enviar al cambiar ----------
  $$('form[data-autoenvio] select').forEach((s) => s.addEventListener('change', () => s.form.submit()));

  // ---------- Confirmaciones ----------
  $$('form[data-confirmar]').forEach((f) =>
    f.addEventListener('submit', (e) => { if (!window.confirm(f.dataset.confirmar)) e.preventDefault(); })
  );

  // ---------- Mostrar contraseña ----------
  $$('[data-ver-pass]').forEach((b) =>
    b.addEventListener('click', () => {
      const input = b.parentElement.querySelector('input');
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    })
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
      opcional.textContent = vendedor ? '(o WhatsApp, obligatorio)' : '(opcional)';
    };
    $$('input[name="rol"]', form).forEach((r) => r.addEventListener('change', actualizar));
    actualizar();
  });

  // ---------- Contadores de caracteres ----------
  $$('[data-contar]').forEach((campo) => {
    const max = Number(campo.dataset.contar);
    const c = document.createElement('span');
    c.className = 'contador';
    campo.closest('.campo').appendChild(c);
    const pintar = () => { c.textContent = `${campo.value.length} / ${max}`; };
    campo.addEventListener('input', pintar);
    pintar();
  });

  // ---------- Precio: vista previa de la regla de donación ----------
  const precio = $('[data-precio]');
  const vista = $('[data-precio-vista]');
  if (precio && vista) {
    const original = vista.innerHTML;
    const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
    const pintar = () => {
      const t = precio.value.replace(/[$,\s]/g, '');
      if (t === '') { vista.innerHTML = original; return; }
      if (!/^\d+(\.\d{1,2})?$/.test(t)) { vista.innerHTML = '<span style="color:var(--rojo);font-weight:600">Solo números, con hasta 2 decimales.</span>'; return; }
      const n = Number(t);
      vista.innerHTML = n === 0
        ? 'Se mostrará como <span class="precio precio--dona" style="font-size:.82rem">Donación / Gratis</span>'
        : `Se mostrará como <span class="precio" style="font-size:.82rem">${moneda.format(n).replace('.00', '')}</span>`;
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

    const pintar = () => {
      contenedor.innerHTML = '';
      Array.from(inputFotos.files).forEach((archivo, i) => {
        const url = URL.createObjectURL(archivo);
        const div = document.createElement('div');
        div.className = 'miniatura';
        div.innerHTML = `<img src="${url}" alt="">${i === 0 && !document.querySelector('.miniatura input[name="quitar_imagen"]') ? '<span class="marca">Portada</span>' : ''}
          <label data-quitar="${i}">Quitar</label>`;
        $('img', div).onload = () => URL.revokeObjectURL(url);
        contenedor.appendChild(div);
      });
    };

    const fijar = (archivos) => {
      const dt = new DataTransfer();
      const validos = archivos.filter((a) => permitidos.includes(a.type) && a.size <= 5 * 1024 * 1024);
      validos.slice(0, Math.max(0, max)).forEach((a) => dt.items.add(a));
      inputFotos.files = dt.files;
      if (validos.length < archivos.length) alertaFotos('Se omitieron archivos que no son JPG, PNG o WEBP, o que pesan más de 5 MB.');
      else if (validos.length > max) alertaFotos(`Solo se agregaron ${max} foto(s): es el máximo permitido.`);
      pintar();
    };

    const alertaFotos = (texto) => {
      let a = $('[data-alerta-fotos]');
      if (!a) {
        a = document.createElement('span');
        a.className = 'error';
        a.dataset.alertaFotos = '';
        contenedor.after(a);
      }
      a.textContent = texto;
    };

    // Acumula: si el usuario elige más fotos después, se suman a las anteriores
    let previas = [];
    inputFotos.addEventListener('click', () => { previas = Array.from(inputFotos.files); });
    inputFotos.addEventListener('change', () => fijar([...previas, ...Array.from(inputFotos.files)]));

    contenedor.addEventListener('click', (e) => {
      const q = e.target.closest('[data-quitar]');
      if (!q) return;
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

  // Evita doble envío del formulario de publicación
  $$('form[data-form-publicacion]').forEach((f) =>
    f.addEventListener('submit', () => {
      const b = $('[data-enviar]', f);
      b.disabled = true;
      b.textContent = 'Revisando y publicando…';
    })
  );

  // ---------- Galería ----------
  $$('[data-galeria]').forEach((g) => {
    const principal = $('[data-galeria-principal]', g);
    $$('.galeria__miniaturas button', g).forEach((b) =>
      b.addEventListener('click', () => {
        principal.src = b.dataset.src;
        $$('.galeria__miniaturas button', g).forEach((x) => x.setAttribute('aria-current', String(x === b)));
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
      const textoOriginal = boton.innerHTML;
      boton.textContent = 'Cargando…';
      try {
        const r = await fetch(`/publicaciones/${caja.dataset.id}/contacto`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No se pudo obtener el contacto.');

        let html = '';
        if (d.telefono) {
          html += `<div class="contacto__dato"><div><span>Teléfono</span><strong>${escapar(d.telefono)}</strong></div>
                   <a class="btn btn--chico" href="${escapar(d.telLink)}">Llamar</a></div>`;
        }
        if (d.whatsapp) {
          html += `<div class="contacto__dato"><div><span>WhatsApp</span><strong>${escapar(d.whatsapp)}</strong></div>
                   <a class="btn btn--chico btn--wa" href="${escapar(d.waLink)}" target="_blank" rel="noopener">Escribir</a></div>`;
        }
        if (!html) html = '<p style="margin:0">Este usuario no tiene datos de contacto registrados.</p>';
        datos.innerHTML = html;
        datos.hidden = false;
        boton.remove();
      } catch (err) {
        boton.disabled = false;
        boton.innerHTML = textoOriginal;
        datos.innerHTML = `<div class="aviso aviso--error">${escapar(err.message)}</div>`;
        datos.hidden = false;
      }
    });
  });
})();
