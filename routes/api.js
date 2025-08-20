const express = require('express');
const router = express.Router();
const animeApi = require('../services/animeApi');

router.get('/anime/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const animeData = await animeApi.getAnimeDetails(slug);

    if (!animeData) {
      return res.status(404).json({ error: 'Anime not found' });
    }

    const sanitizedAnime = animeApi.validateAnimeData(animeData, slug);
    res.json({ success: true, data: sanitizedAnime });
  } catch (error) {
    console.error('API anime detail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/search/suggestions', async (req, res) => {
  try {
    const keyword = req.query.q || '';

    if (keyword.length < 2) {
      return res.json({ suggestions: [] });
    }

    const searchResults = await animeApi.searchAnime(keyword, 1);
    const suggestions = (searchResults?.anime || [])
      .slice(0, 5)
      .map(anime => ({
        title: anime.title,
        slug: anime.slug,
        poster: anime.poster
      }));

    res.json({ suggestions });
  } catch (error) {
    console.error('API search suggestions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/episode/:slug/:episode/sources', async (req, res) => {
  try {
    const { slug, episode } = req.params;
    const episodeData = await animeApi.getEpisodeDetails(slug, episode);

    if (!episodeData) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    res.json({
      success: true,
      sources: episodeData.video_sources || [],
      subtitles: episodeData.subtitles || []
    });
  } catch (error) {
    console.error('API episode sources error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
