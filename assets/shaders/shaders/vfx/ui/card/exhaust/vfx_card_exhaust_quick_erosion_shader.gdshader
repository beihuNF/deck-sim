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
//https://godotshaders.com/shader/hue-shift/
vec4 shift_hue(in vec4 color, in float shift) {
	// The unit gray vector in RGB color space.
	vec3 gray = vec3(0.57735);
	// Project color onto gray axis.
	vec3 projection = gray * dot(gray, color.rgb);
	// Vector from gray axis to original color.
	vec3 U = color.rgb - projection;
	// Vector perpendicular to gray axis and U.
	vec3 V = cross(gray, U);
	// Rotate U and V around the gray axis.
	vec3 shifted = U * cos(shift * 2.0 * PI) + V * sin(shift * 2.0 * PI) + projection;
	return vec4(shifted, color.a);
}
float erosion_from_factors(vec2 factors, float input)
{
	return smoothstep(factors.x, factors.x + factors.y, input);
}

uniform vec2 pivot_offset = vec2(0.0, 0.0);

uniform float frame_count = 4;
uniform vec2 flipbook_size = vec2(2,2);

uniform sampler2D erosion_curve : hint_default_black;
uniform float erosion_offset = 0.1;

uniform float bright_offset : hint_range(0.0, 1.0, 0.05);
uniform sampler2D bright_lut : repeat_disable;

varying float lifetime;
varying float flipbook_offset;
varying vec4 vertex_color;

varying vec2 flipbook_uv;

instance uniform float hue_shift;

void vertex() {
	vertex_color = COLOR;
	lifetime = INSTANCE_CUSTOM.y/INSTANCE_CUSTOM.w;
	flipbook_offset = INSTANCE_CUSTOM.z;

	VERTEX += pivot_offset * (1.0/TEXTURE_PIXEL_SIZE);

	flipbook_uv = flipbook(UV, flipbook_size, (frame_count * flipbook_offset) * 0.99);
}

void fragment() {
	vec4 main_tex = texture(TEXTURE, flipbook_uv);

	float erosion_curve_val = texture(erosion_curve, vec2(lifetime)).r;
	float erosion = erosion_from_factors(vec2(erosion_curve_val, erosion_offset), main_tex.r);

	float bright_erosion = erosion_from_factors(vec2(erosion_curve_val, bright_offset), main_tex.r);

	vec4 bright_color = texture(bright_lut, vec2(bright_erosion));
	bright_color = shift_hue(bright_color, hue_shift);

	COLOR = vec4(bright_color.rgb * vertex_color.rgb, main_tex.a * vertex_color.a * erosion);
}
