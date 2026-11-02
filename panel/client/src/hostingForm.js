function clean(value) {
  return String(value ?? "").trim();
}

// Only fields that differ from the saved snapshot. An empty field stays unchanged.
export function hostingChanges(input, saved = {}) {
  const patch = {};
  const nickname = clean(input.nickname);
  if (nickname && nickname !== (saved.nickname || "")) patch.nickname = nickname;
  const channel = clean(input.channel);
  if (channel && channel !== (saved.channel || "")) patch.channel = channel;
  const serverPassword = String(input.serverPassword ?? "");
  if (serverPassword.trim()) patch.serverPassword = serverPassword;
  const channelPassword = String(input.channelPassword ?? "");
  if (channelPassword.trim()) patch.channelPassword = channelPassword;
  const bitrate = clean(input.bitrate);
  if (bitrate && bitrate !== String(saved.bitrate ?? "")) patch.bitrate = bitrate;
  const volume = clean(input.volume);
  if (volume && volume !== String(saved.volume ?? "")) patch.volume = volume;
  const run = clean(input.run);
  const savedRun = saved.run == null ? "" : saved.run ? "on" : "off";
  if (run && run !== savedRun) patch.run = run;
  if (input.clearStartup === true || input.clearStartup === "on" || input.clearStartup === "1") {
    patch.clearStartup = "on";
  } else {
    const streamId = clean(input.streamId);
    const savedStreamId = saved.startupStreamId == null ? "" : String(saved.startupStreamId);
    if (streamId && streamId !== savedStreamId) patch.streamId = streamId;
    else if (!streamId) {
      const startup = clean(input.startup);
      if (startup) patch.startup = startup;
    }
  }
  return patch;
}
