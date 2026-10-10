shader_type canvas_item;
render_mode blend_mix;

vec2 flipbook(vec2 uv, vec2 size, float progress)
{
	float h_frames = float(size.x);
	float v_frames = float(size.y);
	float particle_total_frames = float(size.x * size.y);
	float particle_frame = floor(progress);
	particle_frame = mod(particle_frame, particle_total_frames);

	vec2 return_uv = uv/vec2(h_frames, v_frames);
	return_uv += vec2(mod(particle_frame, h_frames) / h_frames, floor((particle_frame + 0.5) / h_frames) / v_frames);

	return return_uv;
}
float erosion_from_factors(vec2 factors, float input)
{
	return smoothstep(factors.x, factors.x + factors.y, input);
}

uniform float frame_count = 4;
uniform vec2 flipbook_size = vec2(2,2);

uniform sampler2D lut;

uniform vec2 pivot_offset = vec2(0.0, 0.0);

uniform vec2 distortion_panning_speed;
uniform float distortion_strength;

uniform sampler2D erosion_curve;
uniform float erosion_offset = 0.25;

varying float lifetime;
varying float flipbook_offset;
varying vec4 vertex_color;

varying vec2 flipbook_uv;

void vertex() {
	vertex_color = COLOR;
	lifetime = INSTANCE_CUSTOM.y/INSTANCE_CUSTOM.w;
	flipbook_offset = INSTANCE_CUSTOM.z;

	VERTEX += pivot_offset * (1.0/TEXTURE_PIXEL_SIZE);

	flipbook_uv = flipbook(UV, flipbook_size, frame_count * flipbook_offset * 0.99);
}

void fragment() {
	vec4 distortion_tex = texture(TEXTURE, UV + (TIME * distortion_panning_speed));
	vec4 texture_color =  texture(TEXTURE, flipbook_uv + (distortion_tex.b * distortion_strength));

	vec4 lut_color = texture(lut, texture_color.rr);

	float erosion_curve_val = texture(erosion_curve, vec2(lifetime)).r;
	float erosion_val = erosion_from_factors(vec2(erosion_curve_val, erosion_offset), texture_color.r);

	COLOR = vec4(lut_color.rgb, erosion_val) * vertex_color;
}
