function clean(value) {
  return String(value ?? "").trim();
}

// null clears a saved nickname or channel. A blank password, bitrate, or volume stays unchanged.
function textChange(raw, savedRaw) {
  const next = clean(raw);
  const previous = clean(savedRaw);
  if (next === previous) return undefined;
  return next || null;
}

export function hostingChanges(input, saved = {}) {
  const patch = {};
  const nickname = textChange(input.nickname, saved.nickname);
  if (nickname !== undefined) patch.nickname = nickname;
  const channel = textChange(input.channel, saved.channel);
  if (channel !== undefined) patch.channel = channel;
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
  if (Object.hasOwn(input, "startup") || Object.hasOwn(input, "streamId")) {
    const startup = clean(input.startup);
    const savedStartup = clean(saved.startup);
    const streamId = clean(input.streamId);
    const savedStreamId = saved.startupStreamId == null ? "" : String(saved.startupStreamId);
    if (streamId && streamId !== savedStreamId) patch.streamId = streamId;
    else if (!streamId && !startup) {
      if (savedStartup) patch.clearStartup = "on";
    } else if (!streamId && startup !== savedStartup) patch.startup = startup;
  }
  return patch;
}
