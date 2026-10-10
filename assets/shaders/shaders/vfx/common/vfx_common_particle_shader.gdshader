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

uniform float frame_count = 4;
uniform vec2 flipbook_size = vec2(2,2);

uniform sampler2D lut;

uniform vec2 pivot_offset = vec2(0.0, 0.0);

uniform sampler2D erosion_curve;
uniform float erosion_offset = 0.25;

varying float lifetime;
varying float flipbook_offset;
varying vec4 vertex_color;

void vertex() {
	vertex_color = COLOR;
	lifetime = INSTANCE_CUSTOM.y/INSTANCE_CUSTOM.w;
	flipbook_offset = INSTANCE_CUSTOM.z;

	VERTEX += pivot_offset * (1.0/TEXTURE_PIXEL_SIZE);
}

void fragment() {
	vec2 flipbook_uv = flipbook(UV, flipbook_size, frame_count * flipbook_offset * 0.99);

	vec4 texture_color =  texture(TEXTURE, flipbook_uv);

	vec4 lut_color = texture(lut, texture_color.rr);

	float erosion_curve_val = texture(erosion_curve, vec2(lifetime)).r;
	float erosion_val = smoothstep(erosion_curve_val, erosion_curve_val + erosion_offset, texture_color.a);

	COLOR = vec4(lut_color.rgb, erosion_val) * vertex_color;
}
