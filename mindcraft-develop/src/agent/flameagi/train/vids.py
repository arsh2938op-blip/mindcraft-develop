"""Reserved for future gameplay-video-to-experience processing.

No video source, format, or capture contract has been chosen, so this module
intentionally does not guess at an implementation.
"""


def extract_experiences_from_video(video_path: str) -> list[dict]:
    """Future hook for records compatible with experiences.normalize_experience()."""
    raise NotImplementedError("vids.py is a placeholder — no video pipeline has been designed yet.")
