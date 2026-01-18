import { useState, useRef, useEffect } from 'react'

const VideoBackground = () => {
  const [isMuted, setIsMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      // Browsers requires many videos to be muted for autoplay
      videoRef.current.muted = true
      videoRef.current.play().catch(e => console.warn("Initial autoplay blocked:", e))
    }
  }, [])

  const toggleMute = () => {
    if (videoRef.current) {
      const targetMuted = !isMuted
      videoRef.current.muted = targetMuted
      setIsMuted(targetMuted)

      if (!targetMuted) {
        videoRef.current.volume = 1.0
        videoRef.current.play().catch(val => console.error("Unmute play signal failed:", val))
      }
    }
  }

  return (
    <div className="video-background-container">
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        className="bg-video"
      >
        <source src="/bg.mp4" type="video/mp4" />
      </video>

      <div className="video-controls">
        <button
          type="button"
          onClick={toggleMute}
          className="mute-btn"
          style={{ pointerEvents: 'auto' }}
          title={isMuted ? "Unmute Environment" : "Mute Environment"}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
      </div>

      <style>{`
        .video-background-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
          overflow: hidden;
          background: #000;
        }

        .bg-video {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          min-width: 100%;
          min-height: 100%;
          width: auto;
          height: auto;
          object-fit: cover;
        }

        /* Adjustments for square video on different screen ratios */
        @media (min-aspect-ratio: 1/1) {
          .bg-video {
            width: 100%;
            height: auto;
          }
        }

        @media (max-aspect-ratio: 1/1) {
          .bg-video {
            width: auto;
            height: 100%;
          }
        }

        .video-controls {
          position: fixed;
          bottom: 20px;
          left: 20px;
          z-index: 1000;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .video-background-container:hover .video-controls,
        body:hover .video-controls {
          opacity: 0.6;
        }

        .video-controls:hover {
          opacity: 1;
        }

        .mute-btn {
          background: rgba(192, 232, 237, 0.1);
          border: 1px solid rgba(192, 232, 237, 0.3);
          color: #c0e8ed;
          padding: 8px;
          cursor: pointer;
          border-radius: 4px;
          font-size: 14px;
          backdrop-filter: blur(4px);
          transition: all 0.2s ease;
        }

        .mute-btn:hover {
          background: rgba(192, 232, 237, 0.2);
          border-color: #00fbff;
          color: #00fbff;
          box-shadow: 0 0 10px rgba(0, 251, 255, 0.2);
        }
      `}</style>
    </div>
  )
}

export default VideoBackground
