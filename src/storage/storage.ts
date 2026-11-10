// Capa de guardado. El juego solo habla con `SaveBackend`, así que para pasar
// a base de datos basta con escribir otro backend (ver ApiBackend abajo) y
// cambiar una línea en main.ts.
import type { SaveData } from '../meta/save';

export interface SaveBackend {
  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  clear(): Promise<void>;
}

export class LocalStorageBackend implements SaveBackend {
  constructor(private key = 'typeandrun.save.v1') {}

  async load(): Promise<SaveData | null> {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  }

  async save(data: SaveData): Promise<void> {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      // modo privado o almacenamiento lleno: el juego sigue funcionando
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* nada */
    }
  }
}

/**
 * Backend futuro contra tu servidor (Supabase, Node + PostgreSQL…).
 * Importante: cuando haya ranking o compras reales, el servidor debe validar
 * los Fragmentos y resultados; nunca fiarse de lo que mande el navegador.
 */
export class ApiBackend implements SaveBackend {
  constructor(private baseUrl: string, private token: () => string | null) {}

  private headers() {
    const t = this.token();
    return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  }

  async load(): Promise<SaveData | null> {
    const r = await fetch(`${this.baseUrl}/save`, { headers: this.headers() });
    return r.ok ? ((await r.json()) as SaveData) : null;
  }

  async save(data: SaveData): Promise<void> {
    await fetch(`${this.baseUrl}/save`, { method: 'PUT', headers: this.headers(), body: JSON.stringify(data) });
  }

  async clear(): Promise<void> {
    await fetch(`${this.baseUrl}/save`, { method: 'DELETE', headers: this.headers() });
  }
}
