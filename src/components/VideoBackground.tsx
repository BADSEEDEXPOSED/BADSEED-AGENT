import { useRef, useEffect } from 'react'

const VideoBackground = () => {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      // Browsers requires many videos to be muted for autoplay
      videoRef.current.muted = true
      videoRef.current.play().catch(e => console.warn("Initial autoplay blocked:", e))
    }
  }, [])

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
      `}</style>
    </div>
  )
}

export default VideoBackground
