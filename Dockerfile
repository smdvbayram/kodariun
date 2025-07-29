# --- Temel imaj olarak Node.js'in resmi ve hafif bir versiyonunu kullanıyoruz ---
# Bu, sunucuda daha az yer kaplamasını sağlar.
FROM node:18-slim

# --- Uygulamanın çalışacağı dizini oluşturuyoruz ---
WORKDIR /app

# --- Önce sadece package.json dosyalarını kopyalıyoruz ---
# Bu, Docker'ın katman önbellekleme özelliğinden yararlanarak,
# bağımlılıklar değişmediği sürece her seferinde yeniden yüklenmesini engeller.
COPY package*.json ./

# --- Gerekli tüm kütüphaneleri (express, sqlite3 vb.) yüklüyoruz ---
RUN npm install

# --- Projenin geri kalan tüm dosyalarını (server.js, database.js, html dosyaları vb.) kopyalıyoruz ---
COPY . .

# --- Uygulamanın dış dünyaya açılacağı portu belirtiyoruz ---
# server.js dosyasında belirttiğimiz port ile aynı olmalı.
EXPOSE 3000

# --- Konteyner çalıştığında uygulamayı başlatacak olan komut ---
# Bu komut, package.json dosyasındaki "start" script'ini çalıştırır.
CMD [ "npm", "start" ]
