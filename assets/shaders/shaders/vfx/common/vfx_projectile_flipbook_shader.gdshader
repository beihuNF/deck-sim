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

instance uniform vec2 flipbook_size;
instance uniform float frame_count;
instance uniform float flipbook_speed;
instance uniform float flipbook_offset;
uniform sampler2D hue_shift_curve : repeat_disable, hint_default_black;

uniform sampler2D lut : repeat_disable;

varying vec4 vertex_color;
varying vec2 flipbook_uv;

void vertex() {
	vertex_color = COLOR;

	float flipbook_progress = flipbook_offset + (TIME * flipbook_speed);
	flipbook_uv = flipbook(UV, flipbook_size, ((frame_count * flipbook_offset) + (frame_count * flipbook_progress)) * 0.99);
}

void fragment() {
	vec4 flipbook_texture_color =  texture(TEXTURE, flipbook_uv);
	float alpha = flipbook_texture_color.a * vertex_color.a;

	vec4 lut_color = texture(lut, flipbook_texture_color.rr);
	vec4 initial_color = lut_color * vertex_color;

	COLOR = vec4(initial_color.rgb, alpha);
}
