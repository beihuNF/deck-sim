shader_type canvas_item;
render_mode blend_mix;

float erosion_from_factors(vec2 factors, float input)
{
	return smoothstep(factors.x, factors.x + factors.y, input);
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

uniform sampler2D erosion_texture : repeat_enable;
instance uniform float erosion_texture_x_offset : hint_range(0.0, 1.0, 0.01);

instance uniform float erosion_base : hint_range(-0.2, 1.0, 0.001);
uniform float erosion_offset : hint_range(0.0, 1.0, 0.05);

uniform float bright_offset : hint_range(0.0, 1.0, 0.05);
uniform sampler2D bright_lut : repeat_disable;

instance uniform float hue_shift;

varying vec4 vertex_color;

void vertex() {
	vertex_color = COLOR;
}

void fragment() {
	vec4 main_tex = texture(TEXTURE, UV);
	vec4 erosion_tex = texture(erosion_texture, UV + vec2(erosion_texture_x_offset, 0.0));

	//float erosion = erosion_from_factors(vec2(erosion_base, erosion_offset), erosion_tex.r);
	float erosion = step(erosion_base, erosion_tex.r);
	float bright_erosion = erosion_from_factors(vec2(erosion_base, bright_offset), erosion_tex.r);

	vec4 bright_color = texture(bright_lut, vec2(bright_erosion));
	bright_color = shift_hue(bright_color, hue_shift);

	vec3 main_color = mix(main_tex, bright_color, 1.0 - bright_erosion).rgb;

	COLOR = vec4(main_color * vertex_color.rgb, main_tex.a * vertex_color.a * erosion);
}
