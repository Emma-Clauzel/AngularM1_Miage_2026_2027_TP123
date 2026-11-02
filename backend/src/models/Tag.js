import mongoose from "mongoose";

export const TAG_ICONS = ["star", "heart", "bolt", "music", "guitar", "bookmark"];
export const TAG_COLORS = ["#9e345f", "#ab4b31", "#8a6812", "#35705b", "#326b87", "#66508b"];

const schema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    icon: { type: String, required: true, enum: TAG_ICONS },
    color: { type: String, required: true, enum: TAG_COLORS },
  },
  { timestamps: true },
);

schema.index({ ownerId: 1, name: 1 }, { unique: true });

export const Tag = mongoose.model("Tag", schema);
