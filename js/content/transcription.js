/**
 * YouTube Transcription Extraction
 * Extracts transcripts from YouTube videos using APIs
 */

// Check if current page is YouTube
function isYouTubePage() {
    return (window.location.hostname.includes('youtube.com') ||
        window.location.hostname.includes('youtu.be')) &&
        (window.location.pathname.startsWith('/watch') ||
            window.location.pathname.startsWith('/v/'));
}

// Get YouTube video ID
function getYouTubeVideoId() {
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('v')) return url.searchParams.get('v');
        if (url.hostname === 'youtu.be') return url.pathname.slice(1);
        if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2];
        if (url.pathname.startsWith('/v/')) return url.pathname.split('/')[2];
    } catch (e) {
        console.log('Error extracting video ID:', e);
    }
    return null;
}

// NoteGPT API
async function tryNoteGPTAPI(videoId) {
    try {
        const apiUrl = `https://notegpt.io/api/v2/video-transcript?platform=youtube&video_id=${videoId}`;
        const response = await fetch(apiUrl);

        if (!response.ok) return null;

        const data = await response.json();
        if (data.code !== 100000 || !data.data) return null;

        const transcripts = data.data.transcripts;
        if (!transcripts || Object.keys(transcripts).length === 0) return null;

        const languageCode = Object.keys(transcripts)[0];
        const transcriptData = transcripts[languageCode];

        let segments = null;
        if (transcriptData) {
            segments = transcriptData.custom || transcriptData.default ||
                transcriptData.auto || transcriptData.lines;
            if (!segments && Array.isArray(transcriptData)) segments = transcriptData;
        }

        if (!segments || segments.length === 0) return null;

        let transcript = segments.map(seg => seg.text || seg.content || '').filter(t => t).join(' ');
        transcript = transcript.replace(/\s+/g, ' ').trim();

        if (transcript.length < 50) return null;

        const langInfo = data.data.language_code?.find(l => l.code === languageCode);
        return `[Transcript (${langInfo?.name || languageCode})]:\n\n${transcript}`;
    } catch (e) {
        console.error('[Truth Lens] NoteGPT API error:', e);
        return null;
    }
}

// yt-to-text API
async function tryYtToTextAPI(videoId) {
    try {
        const response = await fetch('https://yt-to-text.com/api/v1/Subtitles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: videoId })
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (data.status !== 'READY' || !data.data?.transcripts) return null;

        const segments = data.data.transcripts;
        if (!segments || segments.length === 0) return null;

        let transcript = segments.map(seg => seg.t || '').filter(t => t).join(' ');
        transcript = transcript.replace(/\s+/g, ' ').trim();

        if (transcript.length < 50) return null;
        return `[Transcript]:\n\n${transcript}`;
    } catch (e) {
        console.error('[Truth Lens] yt-to-text API error:', e);
        return null;
    }
}

// Main transcript extraction
async function extractYouTubeTranscript() {
    const videoId = getYouTubeVideoId();
    if (!videoId) return null;

    let transcript = await tryNoteGPTAPI(videoId);
    if (transcript) return transcript;

    transcript = await tryYtToTextAPI(videoId);
    return transcript;
}
