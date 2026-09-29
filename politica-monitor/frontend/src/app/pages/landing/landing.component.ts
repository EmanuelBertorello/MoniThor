import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

const FEATURES = [
  { icon: '🌐', title: 'Cobertura web total', desc: 'Rastrea sitios de noticias locales, portales digitales y cualquier web pública de tu provincia. Sin límite de fuentes.' },
  { icon: '📘', title: 'Facebook completo', desc: 'Monitorea páginas de medios locales, grupos públicos y cualquier perfil que mencione al candidato en tu zona.' },
  { icon: '📸', title: 'Instagram en tiempo real', desc: 'Sigue hashtags locales, perfiles de influencers y detecta posts virales de tu región al instante.' },
  { icon: '🐦', title: 'Twitter/X político', desc: 'Capturá tweets, debates y tendencias de tu provincia antes que el rival se entere.' },
  { icon: '🧠', title: 'IA de sentimiento político', desc: 'Gemini AI analiza cada mención entendiendo el contexto político argentino, sarcasmo y jerga local.' },
  { icon: '📍', title: 'Filtro geográfico exacto', desc: 'Buscá en Tierra del Fuego, Córdoba, o cualquier provincia. Solo ves lo de tu zona, nunca ruido de otras regiones.' },
  { icon: '⚡', title: 'Alertas de crisis instantáneas', desc: 'Recibí alertas por WhatsApp y email cuando detecta picos de negatividad en las primeras horas.' },
  { icon: '📊', title: 'Reportes ejecutivos', desc: 'Informes en PDF, CSV y Excel listos para reuniones de campaña con datos reales y visualizaciones.' },
  { icon: '👥', title: 'Equipo con roles', desc: 'Admin, Analista y Monitor. Demos de 30 min para prospectos. Permisos granulares por usuario.' },
];

const PLANS = [
  {
    name: 'Básico', price: 'USD 500', period: '/mes', color: '#64748b', highlight: false, tag: null as string | null,
    desc: 'Para candidatos locales que arrancan su monitoreo digital',
    features: ['1 campaña activa', 'Hasta 5 palabras clave', '1 provincia / ciudad', 'Web y Google News', 'Análisis de sentimiento IA', 'Feed en tiempo real', 'Alertas por email', 'Reportes CSV y TXT', '2 usuarios (Admin + Monitor)'],
    missing: ['Facebook / Instagram', 'Alertas WhatsApp', 'API access'],
  },
  {
    name: 'Campaña', price: 'USD 1.500', period: '/mes', color: '#3b82f6', highlight: true, tag: 'MÁS ELEGIDO',
    desc: 'Para campañas provinciales y municipales activas con equipos',
    features: ['Hasta 3 campañas activas', 'Hasta 20 palabras clave', 'Todas las provincias', 'Web + Google News + Noticias', 'Facebook páginas y grupos públicos', 'Instagram perfiles y hashtags', 'Twitter/X monitoreo', 'Análisis IA con Gemini', 'Alertas email + WhatsApp', 'Reportes CSV, TXT, JSON, PDF', '10 usuarios con roles', 'Demos de 30 min ilimitadas'],
    missing: [],
  },
  {
    name: 'Guerra Electoral', price: 'USD 4.000', period: '/mes', color: '#8b5cf6', highlight: false, tag: 'MÁXIMA POTENCIA',
    desc: 'Para campañas provinciales, nacionales y equipos grandes',
    features: ['Campañas ilimitadas', 'Keywords ilimitadas', 'Todo el país simultáneo', 'Todas las fuentes incluidas', 'Facebook + Instagram + Twitter + YouTube', 'IA avanzada con análisis profundo', 'Sala de crisis en tiempo real', 'Alertas multicanal 24/7', 'Usuarios ilimitados', 'API access para integraciones', 'Analista dedicado 8hs/día', 'Soporte prioritario 24/7'],
    missing: [],
  },
];

const PROVINCIAS = ['Buenos Aires','Córdoba','Santa Fe','Mendoza','Tucumán','Entre Ríos','Salta','Misiones','Chaco','Corrientes','Santiago del Estero','San Juan','Jujuy','Río Negro','Neuquén','Formosa','La Pampa','Chubut','San Luis','Catamarca','La Rioja','Santa Cruz','Tierra del Fuego'];

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  styles: [`
    :host { display:block; }
    @keyframes pulse-dot { 0%,100%{opacity:1}50%{opacity:0.3} }
    .pulse-dot { animation: pulse-dot 1s ease-in-out infinite; }
    .feature-card { transition: all .2s; }
    .feature-card:hover { background:rgba(59,130,246,0.06)!important; border-color:rgba(59,130,246,0.25)!important; transform:translateY(-3px); }
    input, textarea, select { outline:none; }
    input::placeholder, textarea::placeholder { color:#334155; }
    select option { background:#0f1623; color:#f1f5f9; }
    html { scroll-behavior:smooth; }
  `],
  template: `
    <div style="font-family:'Inter',system-ui,sans-serif;background:#040911;color:#f1f5f9;overflow-x:hidden;min-height:100vh;">

      <!-- NAV -->
      <nav style="position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(4,9,17,0.9);backdrop-filter:blur(16px);border-bottom:1px solid rgba(59,130,246,0.1);padding:0 6%;">
        <div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;height:64px;gap:16px;">
          <div style="display:flex;align-items:center;gap:10px;flex:1;">
            <div style="width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:17px;">📡</div>
            <span style="font-size:19px;font-weight:900;letter-spacing:-0.5px;">Politica<span style="color:#3b82f6;">Monitor</span></span>
          </div>
          <div class="nav-desktop" style="display:flex;gap:24px;align-items:center;">
            <a href="#funcionalidades" style="color:#94a3b8;font-size:14px;font-weight:500;text-decoration:none;" (click)="scrollTo('funcionalidades', $event)">Funcionalidades</a>
            <a href="#precios" style="color:#94a3b8;font-size:14px;font-weight:500;text-decoration:none;" (click)="scrollTo('precios', $event)">Precios</a>
            <a href="#contacto" style="color:#94a3b8;font-size:14px;font-weight:500;text-decoration:none;" (click)="scrollTo('contacto', $event)">Contacto</a>
            <button (click)="goLogin()" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:8px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">Ingresar →</button>
          </div>
          <button (click)="toggleMenu()" aria-label="Menú"
            style="display:none;background:none;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#f1f5f9;font-size:20px;width:40px;height:40px;cursor:pointer;align-items:center;justify-content:center;"
            class="nav-burger">
            {{ mobileMenuOpen() ? '✕' : '☰' }}
          </button>
        </div>
        @if (mobileMenuOpen()) {
          <div style="border-top:1px solid rgba(59,130,246,0.1);padding:18px 6% 24px;display:flex;flex-direction:column;gap:16px;background:rgba(4,9,17,0.98);">
            <a href="#funcionalidades" style="color:#cbd5e1;font-size:15px;font-weight:600;text-decoration:none;" (click)="scrollTo('funcionalidades', $event)">Funcionalidades</a>
            <a href="#precios" style="color:#cbd5e1;font-size:15px;font-weight:600;text-decoration:none;" (click)="scrollTo('precios', $event)">Precios</a>
            <a href="#contacto" style="color:#cbd5e1;font-size:15px;font-weight:600;text-decoration:none;" (click)="scrollTo('contacto', $event)">Contacto</a>
            <button (click)="goLogin()" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:8px;padding:12px 20px;font-size:14px;font-weight:700;cursor:pointer;width:100%;">Ingresar →</button>
          </div>
        }
      </nav>

      <!-- HERO -->
      <section style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:120px 6% 80px;position:relative;overflow:hidden;">
        <div style="position:absolute;top:15%;left:50%;transform:translateX(-50%);width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,rgba(59,130,246,0.1) 0%,transparent 65%);pointer-events:none;"></div>
        <div style="position:absolute;bottom:10%;right:10%;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,0.06) 0%,transparent 70%);pointer-events:none;"></div>
        <div style="max-width:860px;position:relative;z-index:1;">
          <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:20px;padding:6px 16px;margin-bottom:32px;">
            <div class="pulse-dot" style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></div>
            <span style="font-size:12px;font-weight:700;color:#f87171;letter-spacing:1px;text-transform:uppercase;">Monitoreo político en tiempo real · Argentina</span>
          </div>
          <h1 style="font-size:clamp(40px,6.5vw,78px);font-weight:900;line-height:1.02;margin-bottom:24px;letter-spacing:-3px;">
            Cada mención a tu<br/>candidato,<br/>
            <span style="background:linear-gradient(135deg,#3b82f6 30%,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">antes que nadie</span>
          </h1>
          <p style="font-size:clamp(17px,2vw,22px);color:#94a3b8;max-width:640px;margin:0 auto 44px;line-height:1.7;">
            Inteligencia política para campañas argentinas. Monitorea redes sociales, medios y sitios web de tu provincia en tiempo real con análisis de sentimiento por IA.
          </p>
          <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
            <button (click)="scrollTo('precios', $event)" style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:12px;padding:16px 36px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 0 50px rgba(59,130,246,0.35);">
              Ver planes y precios
            </button>
            <button (click)="goLogin()" style="background:rgba(255,255,255,0.06);color:#f1f5f9;border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:16px 36px;font-size:16px;font-weight:600;cursor:pointer;">
              Demo gratuita →
            </button>
          </div>
          <div style="display:flex;gap:48px;justify-content:center;margin-top:72px;flex-wrap:wrap;">
            @for (stat of stats; track stat.n) {
              <div style="text-align:center;">
                <div style="font-size:30px;font-weight:900;color:#3b82f6;letter-spacing:-1px;">{{ stat.n }}</div>
                <div style="font-size:12px;color:#475569;margin-top:4px;font-weight:500;">{{ stat.l }}</div>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- PROBLEMA -->
      <section style="padding:80px 6%;background:rgba(255,255,255,0.015);border-top:1px solid rgba(255,255,255,0.05);">
        <div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;" class="grid-problema">
          <div>
            <div style="font-size:11px;font-weight:700;color:#ef4444;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px;">El problema real</div>
            <h2 style="font-size:clamp(28px,3vw,44px);font-weight:900;line-height:1.15;margin-bottom:20px;letter-spacing:-1.5px;">
              Las crisis en redes explotan en minutos. Tu equipo se entera en horas.
            </h2>
            <p style="color:#94a3b8;font-size:16px;line-height:1.8;margin-bottom:28px;">
              Cuando el rival publica algo negativo a las 10pm, a las 10:05pm ya tiene 500 likes. A las 10:15pm lo comparten grupos de WhatsApp. Tu equipo lo ve al día siguiente.
            </p>
            @for (p of problems; track p) {
              <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px;">
                <span style="color:#ef4444;flex-shrink:0;margin-top:2px;">✗</span>
                <span style="color:#94a3b8;font-size:15px;line-height:1.5;">{{ p }}</span>
              </div>
            }
          </div>
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="font-size:11px;font-weight:700;color:#10b981;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Con PoliticaMonitor</div>
            @for (s of solutions; track s.t) {
              <div style="display:flex;gap:14px;border-radius:12px;padding:14px 16px;"
                [style.background]="s.color + '08'" [style.border]="'1px solid ' + s.color + '20'">
                <span style="font-size:22px;">{{ s.icon }}</span>
                <div>
                  <div style="font-weight:700;font-size:14px;margin-bottom:3px;" [style.color]="s.color">{{ s.t }}</div>
                  <div style="color:#64748b;font-size:13px;">{{ s.d }}</div>
                </div>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- FEATURES -->
      <section id="funcionalidades" style="padding:100px 6%;">
        <div style="max-width:1100px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:64px;">
            <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Funcionalidades</div>
            <h2 style="font-size:clamp(28px,3vw,46px);font-weight:900;letter-spacing:-2px;margin-bottom:16px;">Todo lo que necesita tu campaña</h2>
            <p style="color:#64748b;font-size:16px;max-width:540px;margin:0 auto;">Diseñado específicamente para campañas políticas argentinas, con foco en el interior del país.</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;" class="grid-3">
            @for (f of features; track f.title) {
              <div class="feature-card" style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:22px;cursor:pointer;">
                <div style="font-size:28px;margin-bottom:12px;">{{ f.icon }}</div>
                <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#e2e8f0;">{{ f.title }}</div>
                <div style="color:#64748b;font-size:13px;line-height:1.6;">{{ f.desc }}</div>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- CÓMO FUNCIONA -->
      <section style="padding:80px 6%;background:rgba(255,255,255,0.015);border-top:1px solid rgba(255,255,255,0.05);">
        <div style="max-width:900px;margin:0 auto;text-align:center;">
          <h2 style="font-size:clamp(26px,3vw,42px);font-weight:900;letter-spacing:-1.5px;margin-bottom:56px;">En 3 pasos empezás a monitorear</h2>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;" class="grid-3">
            @for (step of steps; track step.n) {
              <div>
                <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 16px;box-shadow:0 0 30px rgba(59,130,246,0.3);">{{ step.icon }}</div>
                <div style="font-size:11px;color:#3b82f6;font-weight:700;letter-spacing:1px;margin-bottom:8px;">PASO {{ step.n }}</div>
                <div style="font-weight:800;font-size:16px;margin-bottom:10px;">{{ step.t }}</div>
                <div style="color:#64748b;font-size:14px;line-height:1.6;">{{ step.d }}</div>
              </div>
            }
          </div>
        </div>
      </section>

      <!-- PRECIOS -->
      <section id="precios" style="padding:100px 6%;">
        <div style="max-width:1100px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:64px;">
            <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Planes</div>
            <h2 style="font-size:clamp(28px,3vw,46px);font-weight:900;letter-spacing:-2px;margin-bottom:12px;">Sin contratos anuales</h2>
            <p style="color:#64748b;font-size:16px;">Cancelás cuando querés. Precio fijo en dólares.</p>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:start;" class="grid-3">
            @for (plan of plans; track plan.name) {
              <div style="border-radius:16px;padding:30px;position:relative;"
                [style.background]="plan.highlight ? 'linear-gradient(135deg,rgba(59,130,246,0.1),rgba(139,92,246,0.06))' : 'rgba(255,255,255,0.02)'"
                [style.border]="'1px solid ' + (plan.highlight ? plan.color + '50' : 'rgba(255,255,255,0.08)')"
                [style.box-shadow]="plan.highlight ? '0 0 60px ' + plan.color + '18' : ''"
                [style.transform]="plan.highlight ? 'scale(1.03)' : ''">
                @if (plan.tag) {
                  <div style="position:absolute;top:-13px;left:50%;transform:translateX(-50%);color:#fff;font-size:10px;font-weight:800;padding:4px 14px;border-radius:20px;letter-spacing:1.5px;white-space:nowrap;background:linear-gradient(135deg,#3b82f6,#8b5cf6);">{{ plan.tag }}</div>
                }
                <div style="font-size:11px;font-weight:700;margin-bottom:8px;letter-spacing:1px;text-transform:uppercase;" [style.color]="plan.color">{{ plan.name }}</div>
                <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:8px;">
                  <span style="font-size:40px;font-weight:900;letter-spacing:-2px;">{{ plan.price }}</span>
                  <span style="font-size:13px;color:#475569;">{{ plan.period }}</span>
                </div>
                <div style="font-size:13px;color:#64748b;margin-bottom:24px;line-height:1.5;">{{ plan.desc }}</div>
                <button (click)="scrollTo('contacto', $event)" style="width:100%;padding:13px;border-radius:10px;border:none;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:24px;"
                  [style.background]="plan.highlight ? 'linear-gradient(135deg,' + plan.color + ',#8b5cf6)' : plan.color + '15'"
                  [style.color]="plan.highlight ? '#fff' : plan.color"
                  [style.box-shadow]="plan.highlight ? '0 0 25px ' + plan.color + '40' : ''">
                  Contratar {{ plan.name }}
                </button>
                @for (f of plan.features; track f) {
                  <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px;">
                    <span style="color:#10b981;flex-shrink:0;font-size:13px;margin-top:1px;">✓</span>
                    <span style="font-size:13px;color:#cbd5e1;line-height:1.4;">{{ f }}</span>
                  </div>
                }
                @for (f of plan.missing; track f) {
                  <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:9px;opacity:0.35;">
                    <span style="color:#64748b;flex-shrink:0;">—</span>
                    <span style="font-size:13px;color:#64748b;">{{ f }}</span>
                  </div>
                }
              </div>
            }
          </div>
          <div style="text-align:center;margin-top:36px;padding:18px;background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.15);border-radius:12px;">
            <p style="color:#94a3b8;font-size:14px;">💡 <strong style="color:#f1f5f9;">¿No sabés cuál elegir?</strong> Te hacemos una demo de 30 minutos con el nombre de tu candidato y tu provincia, gratis y sin compromiso.</p>
          </div>
        </div>
      </section>

      <!-- CONTACTO -->
      <section id="contacto" style="padding:100px 6%;background:rgba(255,255,255,0.015);border-top:1px solid rgba(255,255,255,0.05);">
        <div style="max-width:680px;margin:0 auto;">
          <div style="text-align:center;margin-bottom:48px;">
            <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Contacto</div>
            <h2 style="font-size:clamp(28px,3vw,44px);font-weight:900;letter-spacing:-1.5px;margin-bottom:12px;">Pedí tu demo gratuita</h2>
            <p style="color:#64748b;font-size:16px;">Te mostramos el sistema funcionando con el nombre de tu candidato y tu provincia.</p>
          </div>

          @if (sent()) {
            <div style="text-align:center;padding:48px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:16px;">
              <div style="font-size:48px;margin-bottom:16px;">✅</div>
              <h3 style="font-weight:700;margin-bottom:8px;">¡Mensaje recibido!</h3>
              <p style="color:#94a3b8;">Te contactamos en menos de 24 horas para coordinar la demo.</p>
            </div>
          } @else {
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:36px;">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;" class="grid-contacto">
                <div>
                  <label style="display:block;font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Nombre completo</label>
                  <input type="text" [(ngModel)]="contactForm.nombre" placeholder="Juan García"
                    style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#f1f5f9;padding:10px 14px;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;"/>
                </div>
                <div>
                  <label style="display:block;font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Email</label>
                  <input type="email" [(ngModel)]="contactForm.email" placeholder="juan@campaña.com"
                    style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#f1f5f9;padding:10px 14px;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;"/>
                </div>
                <div style="grid-column:1/-1;">
                  <label style="display:block;font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Cargo / Rol</label>
                  <input type="text" [(ngModel)]="contactForm.cargo" placeholder="Coordinador de campaña"
                    style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#f1f5f9;padding:10px 14px;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:inherit;"/>
                </div>
              </div>
              <div style="margin-bottom:16px;">
                <label style="display:block;font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Provincia</label>
                <select [(ngModel)]="contactForm.provincia"
                  style="width:100%;background:#0f1623;border:1px solid rgba(255,255,255,0.1);color:#f1f5f9;padding:10px 14px;border-radius:8px;font-size:14px;">
                  <option value="">Seleccioná provincia</option>
                  @for (p of provincias; track p) {
                    <option [value]="p">{{ p }}</option>
                  }
                </select>
              </div>
              <div style="margin-bottom:20px;">
                <label style="display:block;font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">¿Qué necesitás monitorear?</label>
                <textarea [(ngModel)]="contactForm.mensaje" rows="3" placeholder="Contanos sobre tu candidato y el distrito..."
                  style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#f1f5f9;padding:10px 14px;border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;font-family:inherit;"></textarea>
              </div>
              <button (click)="submitContact()"
                style="width:100%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;border:none;border-radius:10px;padding:15px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 0 40px rgba(59,130,246,0.25);">
                📡 Solicitar demo gratuita →
              </button>
              <p style="text-align:center;color:#334155;font-size:12px;margin-top:12px;">Respondemos en menos de 24 horas · Sin compromiso</p>
            </div>
          }
        </div>
      </section>

      <!-- FOOTER -->
      <footer style="padding:32px 6%;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.4);">
        <div style="max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:13px;">📡</div>
            <span style="font-weight:900;font-size:15px;">Politica<span style="color:#3b82f6;">Monitor</span></span>
          </div>
          <p style="color:#1e293b;font-size:13px;">© 2026 PoliticaMonitor · Inteligencia política para Argentina</p>
          <button (click)="goLogin()" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);color:#60a5fa;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;">Ingresar al sistema →</button>
        </div>
      </footer>

      <style>
        @media (max-width:768px) {
          .nav-desktop { display:none!important; }
          .nav-burger { display:flex!important; }
          .grid-problema { grid-template-columns:1fr!important; gap:36px!important; }
        }
        @media (max-width:900px) {
          .grid-3 { grid-template-columns:repeat(2,1fr)!important; }
        }
        @media (max-width:600px) {
          .grid-3 { grid-template-columns:1fr!important; }
          .grid-contacto { grid-template-columns:1fr!important; }
        }
      </style>
    </div>
  `,
})
export class LandingComponent {
  private router = inject(Router);

  readonly mobileMenuOpen = signal(false);
  readonly sent = signal(false);

  contactForm = { nombre: '', email: '', cargo: '', provincia: '', mensaje: '' };

  readonly features = FEATURES;
  readonly plans = PLANS;
  readonly provincias = PROVINCIAS;

  stats = [
    { n: '24/7', l: 'Monitoreo continuo' },
    { n: '15min', l: 'Actualización' },
    { n: '5+', l: 'Fuentes simultáneas' },
    { n: 'IA', l: 'Análisis automático' },
  ];

  problems = [
    'No sabés lo que dicen en los grupos de Facebook de tu municipio',
    'Te enterás de los ataques cuando ya son virales',
    'No tenés datos duros para responder con argumentos',
    'Perdés horas buscando menciones manualmente',
  ];

  solutions = [
    { icon: '📡', color: '#10b981', t: 'Sabés en 15 minutos', d: 'El sistema rastrea tu provincia automáticamente y te avisa en tiempo real.' },
    { icon: '🔔', color: '#f59e0b', t: 'Alertas antes que el rival', d: 'WhatsApp y email cuando detecta picos de negatividad o contenido viral.' },
    { icon: '🧠', color: '#8b5cf6', t: 'IA analiza el contexto político', d: 'Gemini AI entiende sarcasmo, ironía y jerga política argentina.' },
    { icon: '📊', color: '#3b82f6', t: 'Datos para responder', d: 'Reportes con evidencia real para reuniones de equipo y estrategia.' },
  ];

  steps = [
    { n: '1', icon: '🎯', t: 'Configurás en 5 minutos', d: 'Nombre del candidato, provincia, ciudad y palabras clave. Nada más.' },
    { n: '2', icon: '🤖', t: 'El sistema trabaja solo', d: 'Cada 15 minutos rastrea toda la red de tu zona. Vos no hacés nada.' },
    { n: '3', icon: '🔔', t: 'Tomás decisiones con datos', d: 'Feed en tiempo real, alertas y reportes para el equipo de campaña.' },
  ];

  toggleMenu() { this.mobileMenuOpen.update(v => !v); }

  goLogin() { this.router.navigate(['/login']); }

  scrollTo(id: string, event?: Event) {
    event?.preventDefault();
    this.mobileMenuOpen.set(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  submitContact() {
    if (!this.contactForm.nombre || !this.contactForm.email) {
      alert('Completá nombre y email');
      return;
    }
    this.sent.set(true);
  }
}
