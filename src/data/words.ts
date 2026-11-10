// Diccionario en español, sin tildes. Se reparte solo por longitud.
// Para ampliarlo basta con añadir palabras a la lista (o cargar un JSON más adelante).
import { formatOf, type FormatId } from '../core/formats';

const RAW = `
sol mar luz pan red mesa casa lago pato oso foco hilo vela copa taza pie mano dedo ojo boca lima
pera uva kiwi coco piña ajo sal miel cafe ya no si un mi tu yo te ve da ir toro lobo rata puma
foca mono vaca bote tren auto faro isla mapa nota hoja goma kilo cero uno dos tres seis ocho diez
mil rojo azul gris oro rosa onda eco gas roca humo rayo ola duna cima año niño zona yate jefe juez
jugo lazo pozo vino capa tapa sapo dado rey reto mago hada elfo runa orco gema cofre arco fe paz
voz ley rio pez gato flor nube ruta dia luna miel trol cama bota caja

perro carro calle llave pollo arroz fruta papel libro raton tecla cable verde blanco negro morado
tierra cielo nubes lluvia viento trueno piedra madera metal cobre plata hierro acero vidrio cuerda
rueda motor piloto avion barco cohete cometa orbita radar señal antena robot nivel puntos vida
poder magia dragon espada escudo flecha torre reino guerra heroe sombra oscuro brillo chispa
hielo fuego nieve polvo playa valle selva bosque abeja araña pulpo medusa conejo jirafa delfin
volcan tabla lapiz tinta leche cabra cifra clave carga llama pizza jazz queso mezcla zorro yegua
pelota grillo burro arena bruja varita pocion escoba duende enano grifo fenix hechizo cristal
caldero tesoro mapas gigante corona trono castor buho cuervo sirena perla ancla canoa bufanda
guante cereza fresa melon sandia limon

teclado monitor pantalla programa misterio aventura historia leyenda montaña desierto cascada
tormenta relampago huracan terremoto mariposa elefante tortuga cocodrilo serpiente pinguino
ardilla caballo gallina hormiga escorpion tiburon ballena cangrejo langosta mensaje planeta
estrella galaxia satelite jugador castillo batalla ejercito soldado capitan villano monstruo
fantasma energia bateria lampara bombilla bicicleta autopista carretera submarino kilometro
zanahoria quijote hechicero pergamino amuleto talisman calabaza unicornio telaraña pirata
caballero princesa armadura laberinto frontera brujula linterna mochila sombrero chocolate
vampiro esqueleto relicario

computadora aplicacion desarrollo estructura escritorio navegacion dispositivo inteligencia
artificial temperatura ventilador murcielago transistor interruptor extraordinario maravilloso
espectacular inolvidable constelacion astronauta exploracion descubrimiento laboratorio
experimento investigacion matematicas arquitectura biblioteca universidad conocimiento
imaginacion creatividad rompecabezas caleidoscopio refrigerador helicoptero motocicleta
ferrocarril aeropuerto estacionamiento encantamiento nigromante hechiceria luciernaga
mariquita dinosaurio superheroe invencible invisible
`;

export const WORDS: Record<FormatId, string[]> = { corta: [], media: [], larga: [], epica: [], bloque: [] };

for (const w of new Set(RAW.split(/\s+/).filter((w) => w.length >= 2))) {
  WORDS[formatOf(w)].push(w);
}

// Frases para el formato Conjuro (jefes futuros).
WORDS.bloque.push('abre la puerta', 'luz de luna', 'polvo de hada', 'fuego y hielo');
