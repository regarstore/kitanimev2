const express = require('express');
const router = express.Router();
const animeApi = require('../services/animeApi');
const { getSetting } = require('../models/database');
const { routes } = require('../app');
const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');
const request = require('request');

const getSourceVideo = async (url) => {
  try {
    const host = new URL(url).hostname;
    const fetch = await axios.get(url);
    const $ = cheerio.load(fetch.data);
    let data;
    console.log(host)
    $('script').each((i, el) => {
      const content = $(el).html()?.trim();
      if (content && content.includes('VIDEO_CONFIG')) {
        data = content;
      }
    });

    if (!data) return undefined;
    return JSON.parse(data.replace('var VIDEO_CONFIG = ', '')).streams;
  } catch (e) {
    return e;
  }
};

router.get('/', async (req, res) => {
  try {
    const homeData = await animeApi.getHomeData();
    const siteTitle = await getSetting('site_title') || 'KitaNime - Streaming Anime Subtitle Indonesia';
    const siteDescription = await getSetting('site_description') || 'Nonton anime subtitle Indonesia terlengkap dan terbaru';
    
    res.render('index', {
      title: siteTitle,
      description: siteDescription,
      ongoingAnime: homeData?.ongoing_anime || [],
      completeAnime: homeData?.complete_anime || [],
      currentPage: 'home'
    });
  } catch (error) {
    console.error('Home page error:', error);
    res.render('error', {
      title: 'Terjadi Kesalahan - KitaNime',
      error: {
        status: 500,
        message: 'Tidak dapat memuat data anime'
      }
    });
  }
});

router.post('/', async(req, res) => {
  if(req.body.price){
    const {price} = req.body;
    try{
      const homeData = await animeApi.getHomeData();
      const siteTitle = await getSetting('site_title') || 'KitaNime - Streaming Anime Subtitle Indonesia';
      const siteDescription = await getSetting('site_description') || 'Nonton anime subtitle Indonesia terlengkap dan terbaru';
      const headers = {
        "Accept": "*/*",
        "Accept-Encoding": "deflate, gzip",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "Host": "app.pakasir.com"
      }
      let payload = { 
        project: "webcheckerforwebstreaming",
        amount: parseInt(price),
        order_id: `DKN-${Math.floor(Date.now() / 1000)}-${Math.random().toString(36).slice(2, 6)}`
      }
      const paymentData = await axios.post("https://app.pakasir.com/api/transactions", payload, { headers });
      const user_id = paymentData.data.transaction.id;
  
      const payment = await axios.post(`https://app.pakasir.com/api/transactions/${user_id}/payment`,{
        "payment_method": "qris"
      });
      const date = new Date(payment.data.transaction.payment_number_expires_at);
      const options = { 
        day: "2-digit", 
        month: "long", 
        year: "numeric", 
        hour: "2-digit", 
        minute: "2-digit", 
        hour12: false, 
        timeZone: "Asia/Jakarta" 
      };
      
      const dateFormat = date.toLocaleString("id-ID", options);
      const returnValue = {
        title: siteTitle,
        qrcode: `${payment.data.transaction.payment_number}`,
        expired: dateFormat,
        description: siteDescription,
        ongoingAnime: homeData?.ongoing_anime || [],
        completeAnime: homeData?.complete_anime || [],
        currentPage: 'home'
      }
      console.log(payment.data);
      res.render('index', returnValue);
    }catch(err){
      console.error('Home page error:', err);
      res.render('error', {
        title: 'Terjadi Kesalahan - KitaNime',
        error: {
          status: 500,
          message: 'Tidak dapat memuat data anime'
        }
      });
    }
  }else{
    const {amount, order_id, status} = req.body;
    if(status == 'completed') return res.redirect('/');
  }
});

router.get('/stream', async (req, res) => {
  console.log('streaming..')
  try {
    const googleVideoUrl = req.query.url;
    const range = req.headers.range;
    const token = req.query.token;
    
    if (!googleVideoUrl) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    
    if(!token){
      const match = await getSourceVideo(googleVideoUrl);
      const Referer = new URL(googleVideoUrl).host;
      console.log(Referer)
      const host = new URL(match[0].play_url).hostname;
      const response = await axios.get(match[0].play_url, {
        responseType: 'stream',
        headers: {
          'Range': range,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Pragma': 'no-cache',
          'Referer': `https://${Referer}`
        }
      });
    
      res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
      if (range) {
        res.setHeader('Content-Range', response.headers['content-range']);
        res.setHeader('Accept-Ranges', 'bytes');
        res.status(206);
      }
    
      response.data.pipe(res);
    }
  } catch (error) {
    console.error('Stream error:', error.message);
    res.status(500).json({
      error: 'Failed to stream video',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

router.get('/blog/:token', async (req, res) => {
  console.log('streaming..')
  try {
    const {token} = req.params;
    const googleVideoUrl = `https://www.blogger.com/video.g?token=${token}`;
    const range = req.headers.range;
    
    if (!googleVideoUrl) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    
    if(token){
      const match = await getSourceVideo(googleVideoUrl);
      const Referer = new URL(googleVideoUrl).host;
      console.log(Referer)
      const host = new URL(match[0].play_url).hostname;
      const response = await axios.get(match[0].play_url, {
        responseType: 'stream',
        headers: {
          'Range': range,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Pragma': 'no-cache',
          'Referer': `https://${Referer}`
        }
      });
    
      res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
      if (range) {
        res.setHeader('Content-Range', response.headers['content-range']);
        res.setHeader('Accept-Ranges', 'bytes');
        res.status(206);
      }
    
      response.data.pipe(res);
    }
  } catch (error) {
    console.error('Stream error:', error.message);
    res.status(500).json({
      error: 'Failed to stream video',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
});

router.get("/gdrive/:vid", async (req, res) => {
  const {vid} = req.params;
  const range = req.headers.range;
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    const gdriveUrl = `https://docs.google.com/uc?export=download&id=${vid}`;
    const Referer = new URL(gdriveUrl).host;
    const response = await axios.get(gdriveUrl, {
        responseType: 'stream',
        headers: {
          'Range': range,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Pragma': 'no-cache',
          'Referer': `https://${Referer}`
        }
      });

    res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp4');
    if (range) {
      res.setHeader('Content-Range', response.headers['content-range']);
      res.setHeader('Accept-Ranges', 'bytes');
      res.status(206);
    }

    response.data.pipe(res);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error streaming");
  }
});

router.get('/ongoing', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const ongoingData = await animeApi.getOngoingAnime(page);
    res.render('ongoing', {
      title: `Anime Ongoing - Halaman ${page} - KitaNime`,
      description: 'Daftar anime ongoing terbaru dengan subtitle Indonesia',
      animeList: ongoingData.data || [],
      pagination: ongoingData?.pagination || { current_page: page, last_visible_page: 1 },
      currentPage: 'ongoing'
    });
  } catch (error) {
    console.error('Ongoing page error:', error);
    res.render('error', {
      title: 'Terjadi Kesalahan - KitaNime',
      error: {
        status: 500,
        message: 'Tidak dapat memuat data anime ongoing'
      }
    });
  }
});

router.get('/complete', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const completeData = await animeApi.getCompleteAnime(page);
    res.render('complete', {
      title: `Anime Complete - Halaman ${page} - KitaNime`,
      description: 'Daftar anime complete dengan subtitle Indonesia',
      animeList: completeData?.data || [],
      pagination: completeData?.pagination || { current_page: page, total_pages: 1 },
      currentPage: 'complete'
    });
  } catch (error) {
    console.error('Complete page error:', error);
    res.render('error', {
      title: 'Terjadi Kesalahan - KitaNime',
      error: {
        status: 500,
        message: 'Tidak dapat memuat data anime complete'
      }
    });
  }
});

router.get('/search', async (req, res) => {
  try {
    const keyword = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    
    let searchResults = null;
    if (keyword.trim()) {
      searchResults = await animeApi.searchAnime(keyword, page);
    }
    const genres = await animeApi.getGenres();
    res.render('search', {
      title: keyword ? `Pencarian: ${keyword} - KitaNime` : 'Pencarian Anime - KitaNime',
      description: keyword ? `Hasil pencarian untuk "${keyword}"` : 'Cari anime favorit Anda',
      keyword,
      searchResults: searchResults.data || [],
      pagination: searchResults?.pagination || { current_page: page, total_pages: 1 },
      currentPage: 'search',
      genres
    });
  } catch (error) {
    console.error('Search page error:', error);
    res.render('error', {
      title: 'Terjadi Kesalahan - KitaNime',
      error: {
        status: 500,
        message: 'Tidak dapat melakukan pencarian'
      }
    });
  }
});

router.get('/genres', async (req, res) => {
  try {
    const genresData = await animeApi.getGenres();
    res.render('genres', {
      title: 'Genre Anime - KitaNime',
      description: 'Jelajahi anime berdasarkan genre favorit Anda',
      genres: genresData || [],
      currentPage: 'genres'
    });
  } catch (error) {
    console.error('Genres page error:', error);
    res.render('error', {
      title: 'Terjadi Kesalahan - KitaNime',
      error: {
        status: 500,
        message: 'Tidak dapat memuat data genre'
      }
    });
  }
});

router.get('/genres/:slug', async (req, res) => {
  try {
    const genreSlug = req.params.slug;
    const page = parseInt(req.query.page) || 1;
    const genreData = await animeApi.getAnimeByGenre(genreSlug, page);
    res.render('genre-detail', {
      title: `Genre ${genreData?.genre_name || genreSlug} - KitaNime`,
      description: `Anime dengan genre ${genreData?.genre_name || genreSlug}`,
      genreName: genreData?.genre_name || genreSlug,
      genreSlug,
      animeList: genreData?.anime || [],
      pagination: genreData?.pagination || { current_page: page, total_pages: 1 },
      currentPage: 'genres'
    });
  } catch (error) {
    console.error('Genre detail page error:', error);
    res.render('error', {
      title: 'Terjadi Kesalahan - KitaNime',
      error: {
        status: 500,
        message: 'Tidak dapat memuat data genre'
      }
    });
  }
});

router.get('/movies/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    var movieData = await animeApi.getMovies(page);
    if(!movieData) {
      return res.status(404).render('error', {
        title: 'Tidak ada film anime - KitaNime',
        error: {
          status: 404,
          message: 'Tidak ada film anime\nCoba Kembali!'
        }
      });
    }
    res.render('movie-list', {
      title: `Daftar Film Anime - KitaNime`,
      description: `Daftar film anime terbaru`,
      animeList: movieData.data.movies || [],
      pagination : movieData.data.pagination || { current_page: 1, total_pages: 2 },
      currentPage: 'movies'
    });
  } catch (error) {
    console.error('Movies page error:', error);
    res.render('error', {
      title: 'Terjadi Kesalahan - KitaNime',
      error: {
        status: 500,
        message: 'Tidak dapat memuat data film anime'
      }
    });
  }
});

router.get('/movies/:year/:month/:slug', async (req, res) => {
  try {
    const { year, month, slug } = req.params;

    const movieData = await animeApi.getMovieDetails(year, month, slug);
    var movie = movieData.data.stream_url;
    movie = movie.split('/')[3];
    //https://www.mp4upload.com/embed-iwzh09efokfj.html
    movie = `https://www.mp4upload.com/embed-${movie}.html`;
    
    movieData.data.stream_url = movie;
    res.render('movie-player', {
      title: `${movieData?.data.title || slug} - KitaNime`,
      description: `Film anime ${movieData?.data.title || slug}`,
      anime: movieData.data,
      stream: movieData.data.stream_url,
      currentPage: 'movies'
    });
  } catch (error) {
    console.error('Movie detail page error:', error);
    res.render('error', {
      title: 'Terjadi Kesalahan - KitaNime',
      error: {
        status: 500,
        message: 'Tidak dapat memuat data film anime'
      }
    });
  }
});

// Robots.txt route
router.get('/robots.txt', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  const robotsTxt = `# Robots.txt for KitaNime - Streaming Anime Subtitle Indonesia
# Website: ${baseUrl}
# Generated: ${new Date().toISOString()}

User-agent: *
Allow: /

# Allow all major search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /

User-agent: DuckDuckBot
Allow: /

User-agent: Baiduspider
Allow: /

User-agent: YandexBot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: Twitterbot
Allow: /

# Disallow admin and private areas
Disallow: /admin/
Disallow: /api/
Disallow: /private/
Disallow: /temp/
Disallow: /cache/
Disallow: /*.json$
Disallow: /*.log$

# Allow important directories
Allow: /images/
Allow: /css/
Allow: /js/
Allow: /fonts/

# Crawl delay for respectful crawling
Crawl-delay: 1

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Additional sitemaps (if needed in the future)
# Sitemap: ${baseUrl}/sitemap-anime.xml
# Sitemap: ${baseUrl}/sitemap-episodes.xml
# Sitemap: ${baseUrl}/sitemap-movies.xml`;

  res.set('Content-Type', 'text/plain');
  res.send(robotsTxt);
});

// Enhanced Sitemap.xml route
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Get data for sitemap
    const homeData = await animeApi.getHomeData();
    const ongoingAnime = homeData?.ongoing_anime || [];
    const completeAnime = homeData?.complete_anime || [];
    const genres = await animeApi.getGenres() || [];
    
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  
  <!-- Main Pages -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/ongoing</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/complete</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/movies</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/search</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/genres</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;

    // Add genre pages
    if (genres && genres.length > 0) {
      genres.forEach(genre => {
        if (genre.slug) {
          sitemap += `
  <url>
    <loc>${baseUrl}/genres/${genre.slug}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
        }
      });
    }

    // Add anime URLs with enhanced metadata
    [...ongoingAnime, ...completeAnime].forEach(anime => {
      if (anime.slug) {
        sitemap += `
  <url>
    <loc>${baseUrl}/anime/${anime.slug}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>`;
        
        // Add image information if available
        if (anime.poster) {
          sitemap += `
    <image:image>
      <image:loc>${anime.poster}</image:loc>
      <image:title>${anime.title || anime.slug}</image:title>
      <image:caption>Poster anime ${anime.title || anime.slug}</image:caption>
    </image:image>`;
        }
        
        sitemap += `
  </url>`;
      }
    });

    // Add pagination URLs for ongoing anime
    for (let page = 1; page <= 10; page++) {
      sitemap += `
  <url>
    <loc>${baseUrl}/ongoing?page=${page}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    // Add pagination URLs for complete anime
    for (let page = 1; page <= 10; page++) {
      sitemap += `
  <url>
    <loc>${baseUrl}/complete?page=${page}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    // Add pagination URLs for movies
    for (let page = 1; page <= 5; page++) {
      sitemap += `
  <url>
    <loc>${baseUrl}/movies?page=${page}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }

    sitemap += `
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

router.post('/cookie-consent', (req, res) => {
  res.cookie('cookie_consent', 'accepted', {
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  });
  res.json({ success: true });
});

module.exports = router;
