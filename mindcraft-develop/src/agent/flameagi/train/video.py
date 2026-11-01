# train/video.py

"""
============================================================
FlameAGI Video Learning
============================================================

Handles video-based learning data for FlameAGI.

Flow:

    Minecraft / Tutorial Video
              ↓
          VideoReader
              ↓
        VideoObservation
              ↓
         experiences.py
              ↓
          rewards.py
              ↓
          datasets.py
              ↓
           trainer.py

This module does NOT:
- train the model
- modify FlameMemory
- control MindCraft
- decide rewards
- directly call Ollama

It only turns video information into structured
training observations.

Actual computer-vision / video-AI processing can be
connected later.
============================================================
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import json


# ============================================================
# VIDEO OBSERVATION
# ============================================================

@dataclass
class VideoObservation:
    """
    One observation extracted from a video.
    """

    video: str

    timestamp: float

    description: str = ""

    action: Optional[str] = None

    outcome: Optional[str] = None

    context: Dict[str, Any] = field(
        default_factory=dict
    )

    metadata: Dict[str, Any] = field(
        default_factory=dict
    )

    created_at: str = field(
        default_factory=lambda:
            datetime.now(
                timezone.utc
            ).isoformat()
    )

    def to_dict(self) -> Dict[str, Any]:

        return asdict(self)


# ============================================================
# VIDEO DATASET
# ============================================================

class VideoDataset:

    def __init__(
        self,
        name: str = "flameagi_video"
    ):

        self.name = name

        self.observations: List[
            VideoObservation
        ] = []


    # ========================================================
    # ADD
    # ========================================================

    def add(
        self,
        observation: VideoObservation
    ) -> VideoObservation:

        if not isinstance(
            observation,
            VideoObservation
        ):

            raise TypeError(
                "Expected VideoObservation."
            )

        self.observations.append(
            observation
        )

        return observation


    # ========================================================
    # ADD MANY
    # ========================================================

    def add_many(
        self,
        observations
    ) -> int:

        count = 0

        for observation in observations:

            self.add(
                observation
            )

            count += 1

        return count


    # ========================================================
    # GET ALL
    # ========================================================

    def all(
        self
    ) -> List[VideoObservation]:

        return list(
            self.observations
        )


    # ========================================================
    # LENGTH
    # ========================================================

    def __len__(self):

        return len(
            self.observations
        )


    # ========================================================
    # SAVE
    # ========================================================

    def save(
        self,
        path: str
    ) -> None:

        output = Path(
            path
        )

        output.parent.mkdir(
            parents=True,
            exist_ok=True
        )

        data = {

            "name":
                self.name,

            "created_at":
                datetime.now(
                    timezone.utc
                ).isoformat(),

            "observations":
                [
                    observation.to_dict()
                    for observation
                    in self.observations
                ]
        }

        with output.open(
            "w",
            encoding="utf-8"
        ) as file:

            json.dump(
                data,
                file,
                indent=4,
                ensure_ascii=False
            )


    # ========================================================
    # LOAD
    # ========================================================

    @classmethod
    def load(
        cls,
        path: str
    ) -> "VideoDataset":

        with open(
            path,
            "r",
            encoding="utf-8"
        ) as file:

            data = json.load(
                file
            )

        dataset = cls(
            name=data.get(
                "name",
                "flameagi_video"
            )
        )

        for item in data.get(
            "observations",
            []
        ):

            if not isinstance(
                item,
                dict
            ):
                continue

            dataset.add(
                VideoObservation(
                    video=item.get(
                        "video",
                        ""
                    ),
                    timestamp=float(
                        item.get(
                            "timestamp",
                            0
                        )
                    ),
                    description=item.get(
                        "description",
                        ""
                    ),
                    action=item.get(
                        "action"
                    ),
                    outcome=item.get(
                        "outcome"
                    ),
                    context=item.get(
                        "context",
                        {}
                    ),
                    metadata=item.get(
                        "metadata",
                        {}
                    ),
                    created_at=item.get(
                        "created_at",
                        datetime.now(
                            timezone.utc
                        ).isoformat()
                    )
                )
            )

        return dataset


    # ========================================================
    # CLEAR
    # ========================================================

    def clear(self):

        self.observations = []


# ============================================================
# VIDEO READER
# ============================================================

class VideoReader:

    """
    Lightweight video reader.

    It currently validates video files and creates
    metadata.

    Actual frame extraction can later be implemented
    with OpenCV / FFmpeg / another backend.
    """

    SUPPORTED_EXTENSIONS = {
        ".mp4",
        ".mkv",
        ".avi",
        ".mov",
        ".webm"
    }


    def __init__(
        self,
        path: str
    ):

        self.path = Path(
            path
        )

        self.validate()


    # ========================================================
    # VALIDATE
    # ========================================================

    def validate(self):

        if not self.path.exists():

            raise FileNotFoundError(
                f"Video not found: {self.path}"
            )

        if not self.path.is_file():

            raise ValueError(
                f"Not a video file: {self.path}"
            )

        if (
            self.path.suffix.lower()
            not in self.SUPPORTED_EXTENSIONS
        ):

            raise ValueError(
                "Unsupported video format: "
                f"{self.path.suffix}"
            )


    # ========================================================
    # INFO
    # ========================================================

    def info(
        self
    ) -> Dict[str, Any]:

        return {

            "path":
                str(self.path),

            "name":
                self.path.name,

            "extension":
                self.path.suffix.lower(),

            "size_bytes":
                self.path.stat().st_size
        }


# ============================================================
# CREATE OBSERVATION
# ============================================================

def create_observation(
    video: str,
    timestamp: float,
    description: str = "",
    action: Optional[str] = None,
    outcome: Optional[str] = None,
    context: Optional[
        Dict[str, Any]
    ] = None,
    metadata: Optional[
        Dict[str, Any]
    ] = None
) -> VideoObservation:

    return VideoObservation(

        video=video,

        timestamp=timestamp,

        description=description,

        action=action,

        outcome=outcome,

        context=(
            context
            if isinstance(
                context,
                dict
            )
            else {}
        ),

        metadata=(
            metadata
            if isinstance(
                metadata,
                dict
            )
            else {}
        )
    )


# ============================================================
# VIDEO → TRAINING OBSERVATIONS
# ============================================================

def process_video(
    path: str,
    observations: Optional[
        List[Dict[str, Any]]
    ] = None
) -> VideoDataset:

    """
    Convert manually supplied or externally detected
    video observations into a VideoDataset.

    Example:

        process_video(
            "minecraft_pvp.mp4",
            [
                {
                    "timestamp": 12.5,
                    "description":
                        "Player strafes around opponent.",
                    "action":
                        "strafe",
                    "outcome":
                        "successful_hit"
                }
            ]
        )

    Later, an AI vision backend can automatically
    generate these observations.
    """

    reader = VideoReader(
        path
    )

    dataset = VideoDataset(
        name=reader.path.stem
    )

    if not observations:

        return dataset

    for item in observations:

        if not isinstance(
            item,
            dict
        ):
            continue

        observation = (
            create_observation(
                video=str(
                    reader.path
                ),

                timestamp=float(
                    item.get(
                        "timestamp",
                        0
                    )
                ),

                description=str(
                    item.get(
                        "description",
                        ""
                    )
                ),

                action=item.get(
                    "action"
                ),

                outcome=item.get(
                    "outcome"
                ),

                context=item.get(
                    "context"
                ),

                metadata=item.get(
                    "metadata"
                )
            )
        )

        dataset.add(
            observation
        )

    return dataset


# ============================================================
# VIDEO → EXPERIENCE FORMAT
# ============================================================

def observation_to_experience(
    observation: VideoObservation
) -> Dict[str, Any]:

    """
    Convert a video observation into the generic
    experience structure used by FlameAGI.
    """

    return {

        "request":
            observation.description,

        "response":
            observation.action
            or "",

        "outcome":
            observation.outcome
            or "unknown",

        "context":
            observation.context,

        "metadata": {

            "source":
                "video",

            "video":
                observation.video,

            "timestamp":
                observation.timestamp,

            **observation.metadata
        }
    }


# ============================================================
# DATASET → EXPERIENCES
# ============================================================

def observations_to_experiences(
    dataset: VideoDataset
) -> List[Dict[str, Any]]:

    return [

        observation_to_experience(
            observation
        )

        for observation
        in dataset.observations
    ]