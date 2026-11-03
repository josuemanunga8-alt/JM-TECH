/* Catálogo JM TECH de demostración. Verifica los datos comerciales antes de publicar. */
const JMTECH_CATALOG = [
  {
    id: 1, name: 'iPhone 15', brand: 'Apple', storage: '128 GB', price: 2799000,
    stock: 12, color: 'Azul', condition: 'Nuevo (demo)',
    desc: 'Registro de producto de demostración. Verifica las características con el fabricante.',
    features: ['Chip A16 Bionic', 'Cámara principal de 48 MP', 'USB-C', 'Face ID'],
    image: './imagenes/celulares/iPhone15BLUE.webp',
    imageSource: 'https://www.apple.com/iphone-15/',
    imageCredit: 'Apple · imagen de producto',
    imageLicense: '',
    legacyImages: [
      './imagenes/celulares/iphone-15-small.jpg',
      './imagenes/celulares/iphone-15.jpg',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-finish-select-202309-6-1inch-black?wid=800&hei=800&fmt=jpeg&qlt=90'
    ]
  },
  {
    id: 2, name: 'Samsung Galaxy A55', brand: 'Samsung', storage: '128 GB', price: 1249000,
    stock: 8, color: 'Violeta', condition: 'Nuevo (demo)',
    desc: 'Registro de producto de demostración. Verifica las características con el fabricante.',
    features: ['Pantalla AMOLED 6,6" 120 Hz', 'Batería 5000 mAh', 'Cámara 50 MP'],
    image: './imagenes/celulares/SamsungGalaxyA555G2024VIOLET.avif',
    imageSource: '',
    imageCredit: 'Imagen de referencia aportada',
    imageLicense: ''
  },
  {
    id: 3, name: 'Xiaomi Redmi 15', brand: 'Xiaomi', storage: '128 GB', price: 899000,
    stock: 3, color: 'Violeta', condition: 'Nuevo (demo)',
    desc: 'REDMI 15 según la ficha global de Xiaomi. Precio y existencias son datos de demostración.',
    features: ['Pantalla FHD+ de 6,9" hasta 144 Hz', 'Batería de 7000 mAh', 'Cámara principal de 50 MP', 'Snapdragon 685', 'Carga rápida de 33 W'],
    image: './imagenes/celulares/XiaomiRedmi15-product.jpg',
    imageSource: 'https://www.mi.com/global/product/redmi-15/',
    imageCredit: 'Xiaomi · imagen oficial del producto',
    imageLicense: '',
    legacyNames: ['Xiaomi Redmi Note 13'],
    legacyImages: [
      './imagenes/celulares/XiaomiRedmi15.jpg',
      'https://i02.appmifile.com/mi-com-product/fly-birds/redmi-note-13/PC/bac9e4d29124ae838486e7f567d14361.jpg'
    ]
  },
  {
    id: 4, name: 'Motorola Edge 40', brand: 'Motorola', storage: '256 GB', price: 1499000,
    stock: 10, color: 'Verde', condition: 'Nuevo (demo)',
    desc: 'Registro de producto de demostración. Verifica las características con el fabricante.',
    features: ['Pantalla pOLED 6,55" 144 Hz', 'Carga 68 W', 'Cámara 50 MP'],
    image: 'https://fdn2.gsmarena.com/vv/bigpic/motorola-edge-40.jpg',
    imageSource: 'https://www.gsmarena.com/motorola_edge_40-12204.php',
    imageCredit: 'GSMArena · imagen de ficha',
    imageLicense: '',
    legacyImages: [
      'https://media.motorolanews.fiestic.com/2023/05/08032953/Introducing-the-motorola-edge-40-a-device-completely-submersed-in-style.jpg'
    ]
  },
  {
    id: 5, name: 'iPhone 14', brand: 'Apple', storage: '128 GB', price: 2499000,
    stock: 5, color: 'Medianoche', condition: 'Nuevo (demo)',
    desc: 'Registro de producto de demostración. Verifica las características con el fabricante.',
    features: ['Pantalla OLED 6,1"', 'Chip A15 Bionic', 'Modo Acción'],
    image: 'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-14-finish-select-202209-6-1inch-midnight?wid=800&hei=800&fmt=jpeg&qlt=90',
    imageSource: 'https://www.apple.com/iphone-14/',
    imageCredit: 'Apple · imagen de producto',
    imageLicense: '',
    legacyImages: [
      './imagenes/celulares/iphone-14-y-14-plus-small.jpg',
      './imagenes/celulares/iphone-14-y-14-plus.jpg',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-14-finish-select-202209-6-1inch-midnight?wid=800&hei=800&fmt=jpeg&qlt=90'
    ]
  },
  {
    id: 6, name: 'Samsung Galaxy S24', brand: 'Samsung', storage: '256 GB', price: 3299000,
    stock: 6, color: 'Violeta', condition: 'Nuevo (demo)',
    desc: 'Registro de producto de demostración. Verifica las características con el fabricante.',
    features: ['Dynamic AMOLED 6,2"', 'Cámara 50 MP', 'Galaxy AI'],
    image: 'https://images.samsung.com/is/image/samsung/assets/us/2501/pcd/smartphones/galaxy-s24/galaxy-S24-ft02-kv_MO.jpg?$720_N_JPG$',
    imageSource: 'https://www.samsung.com/us/smartphones/galaxy-s24/',
    imageCredit: 'Samsung · imagen de producto',
    imageLicense: ''
  },
  {
    id: 7, name: 'Xiaomi 15', brand: 'Xiaomi', storage: '512 GB', price: 3499000,
    stock: 5, color: 'Negro', condition: 'Nuevo (demo)',
    desc: 'Registro de producto de demostración. Verifica precio, almacenamiento y disponibilidad con el fabricante.',
    features: ['Sistema de cámaras Leica de 50 MP', 'Pantalla AMOLED de 120 Hz', 'Procesador Snapdragon 8 Elite'],
    image: 'https://i02.appmifile.com/mi-com-product/fly-birds/xiaomi-15/pc/2fb551f068f8de5461069dab5cf84556.jpg?f=webp',
    imageSource: 'https://www.mi.com/global/product/xiaomi-15/',
    imageCredit: 'Xiaomi · imagen oficial del producto',
    imageLicense: ''
  },
  {
    id: 8, name: 'HONOR 400', brand: 'HONOR', storage: '256 GB', price: 1899000,
    stock: 6, color: 'Negro', condition: 'Nuevo (demo)',
    desc: 'Registro de producto de demostración. Verifica precio, almacenamiento y disponibilidad con el fabricante.',
    features: ['Cámara principal de 200 MP', 'Batería de 6000 mAh', 'Pantalla de 120 Hz'],
    image: 'https://fdn2.gsmarena.com/vv/bigpic/honor-400.jpg',
    imageSource: 'https://fdn2.gsmarena.com/vv/bigpic/honor-400.jpg',
    imageCredit: 'GSMArena · imagen de ficha',
    imageLicense: ''
  },
  {
    id: 9, name: 'OPPO A5 Pro 5G', brand: 'OPPO', storage: '256 GB', price: 1199000,
    stock: 7, color: 'Marrón', condition: 'Nuevo (demo)',
    desc: 'Registro de producto de demostración. Verifica precio, almacenamiento y disponibilidad con el fabricante.',
    features: ['Procesador MediaTek Dimensity 6300', 'Batería de 5800 mAh', 'Conectividad 5G'],
    image: 'https://www.oppo.com/content/dam/oppo/product-asset-library/a/a5-pro-5g/en/pink-brown-tw/v1/assets/images-color-switch-l5-1-1-pad-1-95.jpg.avif',
    imageSource: 'https://www.oppo.com/en/smartphones/series-a/a5-pro-5g/',
    imageCredit: 'OPPO · imagen oficial del producto',
    imageLicense: ''
  }
];

if (typeof module !== 'undefined' && module.exports) module.exports = JMTECH_CATALOG;
if (typeof window !== 'undefined') window.JMTECH_CATALOG = JMTECH_CATALOG;
